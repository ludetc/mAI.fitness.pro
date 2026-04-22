# Architecture

Living description of the mAI.fitness.pro system. **Keep this current** — update it in the same commit as any change that alters structure, routes, schema, auth, or external integrations. See `CLAUDE.md` for the rules.

Last structural update: `2026-04-22` (Pass 4: real-time session execution + in-workout swaps).

---

## High-level shape

Two runtime targets connected by a typed HTTP contract:

```
 ┌────────────────────┐     HTTPS + Bearer JWT      ┌────────────────────┐
 │   apps/mobile      │ ──────────────────────────▶ │   apps/api         │
 │   Expo / RN / TS   │                             │   Cloudflare Worker│
 │   Expo Router      │ ◀────────────────────────── │   Hono + D1        │
 └────────────────────┘       JSON responses         └────────────────────┘
          ▲                                                   │
          │                                                   ▼
          │                                          ┌────────────────────┐
          │                                          │   Cloudflare D1    │
          │                                          │   (SQLite @ edge)  │
          │                                          └────────────────────┘
          │
          │  OAuth 2.0 (id_token)
          ▼
 ┌────────────────────┐
 │   Google Identity  │
 └────────────────────┘
```

Both sides share types via `packages/shared` (consumed as source `.ts` — no build step).

---

## Workspaces

| Workspace | Package name | Role |
|---|---|---|
| `apps/mobile` | `@mai/mobile` | Expo app, user-facing UI. File-based routing via Expo Router. |
| `apps/api` | `@mai/api` | Cloudflare Worker. All backend logic, DB access, third-party integrations. |
| `packages/shared` | `@mai/shared` | Request/response types, domain types (`User`, `SessionPayload`, etc.). |

Root `package.json` wires npm workspaces and top-level scripts (`dev:api`, `dev:mobile`, `typecheck`, `migrate:local`).

---

## Auth & session model

**Identity provider:** Google (OAuth 2.0 via `expo-auth-session` — not literal Google One-Tap, which is web-only).

**Session transport:** HS256 JWT signed by the Worker, stored client-side in `expo-secure-store`, sent as `Authorization: Bearer <jwt>` on every request.

**Flow:**

1. Mobile launches OAuth with platform-specific Google client IDs (`EXPO_PUBLIC_GOOGLE_CLIENT_ID_{IOS,ANDROID,WEB}`).
2. On success, mobile receives a Google `id_token` and POSTs it to `POST /auth/google`.
3. Worker validates the `id_token`:
   - Fetches Google JWKS (`https://www.googleapis.com/oauth2/v3/certs`), cached via `caches.default` for 1 hour.
   - Verifies RS256 signature, `iss`, `aud`, `exp`.
4. Worker upserts the user in D1 by `google_sub` (Google's stable subject claim).
5. Worker signs a 30-day HS256 session JWT using `JWT_SECRET` and returns `{ token, user }`.
6. Subsequent requests go through the `requireAuth` middleware, which verifies the JWT and loads the user from D1 into `c.get('user')`.

**Trust boundary:** the Worker. Never trust the mobile app for identity — it proves identity only by presenting a valid session JWT, which only the Worker can mint.

**Web Crypto choice:** the Worker runtime has no `Buffer`. All JWT base64url handling uses `btoa`/`atob` + `TextEncoder`. See `apps/api/src/lib/jwt.ts`.

---

## HTTP routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness probe. Returns `{ok: true}`. |
| POST | `/auth/google` | none | Exchange Google `id_token` for session JWT. |
| GET | `/me` | Bearer | Return the current user. |
| GET | `/me/profile` | Bearer | Return `{profile, onboardingConversationId}`. Both null if onboarding never started. |
| POST | `/chat/onboarding/start` | Bearer | Create or resume onboarding conversation. Idempotent per user. Returns conversation + messages. |
| POST | `/chat/onboarding/:id/send` | Bearer | Append user message, call AI, persist assistant turn. Returns new messages + `completed` flag. When AI invokes the `save_profile` tool, the profile is persisted and the conversation is marked complete in the same response. |
| GET | `/chat/onboarding/:id` | Bearer | Full history + profile (profile null until completion). |
| GET | `/workouts/current` | Bearer | Current active plan or `{plan: null}`. |
| POST | `/workouts/generate` | Bearer | Generate a new plan from the user's profile. Archives any prior active plan. 409 if no profile; 503 if planning provider is unconfigured; 502 if the model failed to return a valid plan. |
| POST | `/sessions/start` | Bearer | Start a session (or resume the active one — at most one in-progress per user). Body: `{planId, sessionIndex}`. Returns `{session, plannedSession}`. |
| GET | `/sessions/active` | Bearer | Current in-progress session envelope or `{session: null}`. |
| GET | `/sessions/:id` | Bearer | Full session envelope including the planned session data. |
| PUT | `/sessions/:id` | Bearer | Replace the exercises array (log sets, skip, substitute). 409 if already completed. |
| POST | `/sessions/:id/complete` | Bearer | Mark the session complete. 409 if already completed. |
| POST | `/sessions/:id/adjust` | Bearer | Ask the chat provider for a single replacement exercise. Body: `{exerciseIndex, reason, details?}`. Returns `{suggestion, rationale}`. Client applies the swap client-side, then PUTs it back. |

All responses are JSON. Errors use `{ error: <slug>, message?: <string> }` with appropriate HTTP status.

CORS is enforced via `ALLOWED_ORIGINS` env var (comma-separated list, checked against request `Origin`).

### AI provider 503 behavior

`POST /chat/onboarding/:id/send` returns **503 `ai_not_configured`** when the configured provider's API key env var is missing. The provider check runs **before** persisting the user message, so 503 is a no-op on the DB.

---

## Data model (D1)

Schema lives in `apps/api/migrations/`. Apply locally with `npm run migrate:local -w @mai/api`.

### `users` (0001_init.sql)

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID generated by the Worker on first sign-in. |
| `google_sub` | TEXT UNIQUE NOT NULL | Google's stable subject claim — the real identity key. |
| `email` | TEXT NOT NULL | Indexed. |
| `name` | TEXT | From Google profile, may be null. |
| `picture` | TEXT | URL to Google avatar. |
| `created_at` | INTEGER NOT NULL | Unix epoch ms. |
| `updated_at` | INTEGER NOT NULL | Unix epoch ms. |

Indexes: `idx_users_email` on `users(email)`.

### `conversations`, `messages`, `profiles` (0002_onboarding.sql)

- **`conversations`** — a single chat session. Fields: `id`, `user_id` (FK), `kind` (`'onboarding'` for Pass 2; later: `'session_adjust'`, etc.), `created_at`, `completed_at`. Indexes on `(user_id)` and `(user_id, kind)`.
- **`messages`** — ordered turns within a conversation. Fields: `id`, `conversation_id` (FK), `role` (`'system'|'user'|'assistant'|'tool'`), `content`, `tool_calls` (JSON, nullable), `tool_call_id` (nullable, set on `role='tool'`), `created_at`. Index on `(conversation_id, created_at)`. The Worker persists raw assistant turns (including tool calls) for accurate context rebuild; the client only sees `user` and `assistant` text turns via the history endpoint.
- **`profiles`** — one row per user. `user_id` PK (FK to users), `data` JSON blob, `created_at`, `updated_at`. Schema of `data` lives in `packages/shared/src/onboarding.ts` as the `Profile` type. Kept as JSON to avoid migration churn as discovery fields evolve.

### `workout_plans` (0003_workouts.sql)

- Fields: `id`, `user_id` (FK), `status` (`'active'|'archived'`), `goal` (TEXT, nullable, denormalised from the profile for quick listing), `data` (JSON), `created_at`.
- Indexes: `idx_workout_plans_user_status` on `(user_id, status)` and a **partial unique index** `uq_workout_plans_user_active` on `(user_id) WHERE status = 'active'` — enforces at-most-one active plan per user at the DB layer.
- Flow: `POST /workouts/generate` archives existing active rows, then inserts the new row with `status='active'`. Old plans are kept (not deleted) for history and future personalisation signals.
- `data` is a `WorkoutPlan` (see `packages/shared/src/workouts.ts`): `{name, summary, sessionsPerWeek, durationWeeks, weeklyTemplate: WorkoutSession[]}`. Each `WorkoutSession` has `title, focus, durationMinutes, exercises: Exercise[]`, and each `Exercise` has `name, sets, reps, restSeconds, notes?`.

### `session_logs` (0004_sessions.sql)

- Fields: `id`, `user_id` (FK), `plan_id` (FK), `session_index`, `session_title` (denormalised from the plan so logs survive a regen that removed the source session), `started_at`, `completed_at` (nullable), `exercises` (JSON of `ExerciseLog[]` with per-set `{reps, weightKg?, rpe?}` and optional `skipped` / `substitutedFor` / `notes` flags), `notes` (TEXT, nullable, whole-session notes).
- Indexes: `(user_id, completed_at)` for active lookup; `(user_id, started_at DESC)` for history; and a **partial unique** `(user_id) WHERE completed_at IS NULL` — at-most-one in-progress session per user at the DB layer.
- `/sessions/start` is idempotent: if an active session exists, it's returned as-is (regardless of the requested `planId`/`sessionIndex`). The user finishes or abandons the active one before starting another.
- PUT/complete always check `completed_at IS NULL` before mutating, so a completed log is immutable.

---

## Environment variables & secrets

### Worker (`apps/api`)

| Name | Type | Where | Purpose |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | var | `wrangler.toml` | Google OAuth Web client ID; the `aud` the Worker accepts. |
| `ALLOWED_ORIGINS` | var | `wrangler.toml` | CSV of CORS-allowed origins. |
| `JWT_SECRET` | secret | `.dev.vars` / `wrangler secret put` | HMAC key for session JWTs. |
| `OPENAI_API_KEY` | secret | `.dev.vars` / `wrangler secret put` | For providers using `openai`. Missing → 503 `ai_not_configured`. |
| `ANTHROPIC_API_KEY` | secret | `.dev.vars` / `wrangler secret put` | For providers using `anthropic`. Missing → 503 `ai_not_configured`. |
| `AI_MODEL_CHAT` | var | `.dev.vars` / `wrangler.toml` | `<provider>/<model>` for chat role. Default: `openai/gpt-4o-mini`. |
| `AI_MODEL_PLANNING` | var | `.dev.vars` / `wrangler.toml` | Default: `anthropic/claude-3-5-sonnet-latest`. |
| `AI_MODEL_VISION` | var | `.dev.vars` / `wrangler.toml` | Default: `openai/gpt-4o`. |
| `DB` | binding | `wrangler.toml` | D1 database named `mai-db`. |

### Mobile (`apps/mobile`)

| Name | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Base URL of the Worker (e.g. `http://localhost:8787` in dev). |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS` | iOS OAuth client ID. |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID` | Android OAuth client ID. |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB` | Web OAuth client ID; reused for Expo Go proxy. |

All `EXPO_PUBLIC_*` vars are baked into the bundle — do not put secrets here.

---

## Mobile app shape

- **`app/_layout.tsx`** — mounts `<AuthProvider>`, routes based on auth status.
- **`app/index.tsx`** — sign-in screen (unauthenticated).
- **`app/(app)/`** — authenticated routes group. All screens inside are gated on `status === 'signedIn'`.
  - **`index.tsx`** — home. Three-state gate: (a) no profile → onboarding CTA; (b) profile but no active plan → "Generate this week" CTA; (c) plan exists → plan preview card tapping into `/plan`. Always shows profile summary beneath (once profile exists). Plan is reloaded via `useFocusEffect` on every focus so regenerations elsewhere are reflected.
  - **`onboarding.tsx`** — chat UI. Calls `startOnboarding` on mount to resume or create; `sendOnboardingMessage` on each user turn. When the response has `completed: true`, refreshes the profile on the AuthProvider and redirects home.
  - **`plan.tsx`** — plan viewer. Renders the active `WorkoutPlan` as a header card + one card per `WorkoutSession` (day number, title, focus, duration, exercise rows). "Start this session" on each card navigates to `/session`. "Regenerate plan" button calls `POST /workouts/generate` and swaps the plan in-place.
  - **`session.tsx`** — real-time session runner. Accepts either `?sessionId=X` (resume) or `?planId=X&index=Y` (start). Shows current exercise focus card, live set logger (reps/weight/RPE input), exercise list with progress, swap sheet (reason picker → AI suggestion → accept/reject), finish button. Writes through `PUT /sessions/:id` on every mutation (best-effort; UI stays playable if the PUT fails).
- **`src/providers/AuthProvider.tsx`** — React context owning `{user, profile, onboardingConversationId, status, signInWithIdToken, signOut, refreshProfile}`. On hydrate, fetches both `/me` and `/me/profile` so the home screen can gate on profile status without an extra round-trip.
- **`src/lib/`** — `session.ts` (token storage), `api.ts` (fetch wrapper), `auth.ts` (Google OAuth config), `onboarding.ts` (chat + profile API client), `workouts.ts` (plan API client), `sessions.ts` (session runner API client — note the plural, distinct from token `session.ts`).

---

## AI provider abstraction (`apps/api/src/lib/ai/`)

| File | Role |
|---|---|
| `types.ts` | `ChatMessageText`, `ChatRequest`, `ChatResult`, `ToolDefinition`, `ToolCall`, `JsonSchema`, `AiRole`. |
| `provider.ts` | `Provider` interface (`chat(req): Promise<ChatResult>`) + `ProviderError`. |
| `openai.ts` | `OpenAIProvider` — converts our message format to OpenAI's chat completions API (including tool call / tool result shapes). |
| `anthropic.ts` | `AnthropicProvider` — same, against Anthropic Messages API. System prompt hoisted out of messages; tool results wrapped into `user` `tool_result` blocks. |
| `index.ts` | `getProvider(env, role)` — parses `AI_MODEL_<ROLE>` env var as `<provider>/<model>`, falls back to TECH.md defaults, throws when the API key is missing. |

Adding a new provider is: a new file implementing `Provider`, plus a branch in `getProvider`. No caller changes.

**Tool use:** both providers translate our canonical `ToolDefinition` / `ToolCall` shapes. The onboarding system prompt + `save_profile` tool live in `apps/api/src/prompts/onboarding.ts`.

## Future-phase integration points

These are reserved — **not implemented yet**. Listed so future work slots in predictably.

| Phase | Worker additions | Mobile additions | D1 tables | External |
|---|---|---|---|---|
| 4. Equipment audit | `POST /equipment/scan` | `expo-camera`, `expo-image-picker` | `equipment`, `equipment_photos` | R2 bucket, GPT-4o Vision |
| 5b. Scheduling | `scheduled_sessions` table, commit/complete endpoints | Calendar UI, "start today's session" card | `scheduled_sessions` | — |
| 7. Engagement | `scheduled()` cron | Push token registration | `push_tokens`, `notifications` | Expo Push API |
| 8. Design polish | — | Theme tokens, typography, haptics, micro-interactions | — | — |
| Also deferred — streaming for `/chat/onboarding/:id/send`; `exercise_library` canonical table (trusts the model to produce canonical names); session history/stats views; dynamic next-week generation that reads `session_logs` for progression. |

When you implement any of these, **move the row from this table into the live sections above** and add to `DEV_NOTES.md`.

---

## Deliberate non-choices (so nobody re-litigates them)

- **npm workspaces, not pnpm.** Avoids a global install.
- **HS256, not RS256, for session JWTs.** Simpler key management in Pass 1; revisit if we ever expose verification to third parties.
- **JWT stored in `expo-secure-store`, not HttpOnly cookies.** React Native apps don't share cookie jars with the OAuth browser redirect cleanly; Bearer is simpler and fine for a native client.
- **No server-stored sessions.** Workers are stateless — a signed JWT avoids a D1 round-trip on every request. User data is re-fetched from D1 only when `/me` is called.
- **Google One-Tap → OAuth redirect.** REQs.md says One-Tap; literal One-Tap is web-only. On native we use the standard OAuth browser flow.
