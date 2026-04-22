# Dev Notes

Reverse-chronological log. **One entry per commit** (see `CLAUDE.md` — this is non-negotiable). Newest on top.

Template:

```markdown
## YYYY-MM-DD — slug-title

**What:** …
**Why:** …
**Follow-ups:** …
**Verification:** …
```

---

## 2026-04-22 — pass-3-workout-plan-generation

**What:**
- **Shared types** (`packages/shared/src/workouts.ts`): `Exercise`, `WorkoutSession`, `WorkoutPlan`, `StoredWorkoutPlan`, `GenerateWorkoutResponse`, `CurrentWorkoutResponse`. Exported from index + added to package exports map.
- **D1 migration `0003_workouts.sql`**: `workout_plans(id, user_id FK, status CHECK IN active/archived, goal TEXT, data JSON, created_at)`. Two indexes: `(user_id, status)` for lookups, plus a **partial unique** index `(user_id) WHERE status='active'` so the at-most-one-active-plan invariant is enforced in SQLite, not app code.
- **DB helpers** (`apps/api/src/lib/db.ts`): `archiveActivePlans`, `createActivePlan` (wraps archive + insert), `getActivePlan`.
- **Planning prompt & tool** (`apps/api/src/prompts/planning.ts`): `buildPlanningSystemPrompt(profile)` inlines the profile as hard constraints, explicit rules around session count/duration, environment, contraindications. `save_plan` tool with nested JSON schema for the full `WorkoutPlan` shape (weekly_template → sessions → exercises with sets/reps/rest_seconds/notes?).
- **Worker routes** (`apps/api/src/routes/workouts.ts`): `GET /workouts/current` and `POST /workouts/generate`. Generate is forced-tool-choice (`toolChoice: {name: save_plan}`) on the planning provider (default Anthropic Claude per TECH.md). The route validates the tool call's input in `toolInputToPlan` — missing required fields → 502 `planning_invalid`. The provider.chat call uses 4000 max tokens for the larger structured output.
- **Mobile** (`apps/mobile/`): `src/lib/workouts.ts` client. New `app/(app)/plan.tsx` with header card, per-session cards showing title/focus/duration + exercise rows, regenerate button. Home screen (`app/(app)/index.tsx`) now has three states (no profile / profile-no-plan / plan) and uses `useFocusEffect` to reload the current plan every time home regains focus. Stack layout registers `plan` as a child route with "Your plan" title.
- **ARCHITECTURE.md** updated: new routes, `workout_plans` schema including the partial unique index, mobile plan.tsx, Phase 5 removed from future table (replaced with "5b. Scheduling" as the logical next carve-out).

**Why:**
User said "keep going". The highest-value next step after onboarding is showing the user an actual plan — that's the product's payoff. Phase 4 (photo equipment audit) would need R2 + Vision infra for a feature the user can work around today (list equipment in the onboarding chat). Phase 5 uses infra we already have (planning provider role wired in Pass 2) and turns a saved profile into a visible, regeneratable training week. The partial unique index in SQL keeps the "one active plan" invariant bulletproof even if two generate calls race.

**Follow-ups:**
- Real generation not verified — needs `ANTHROPIC_API_KEY`. 503 path confirmed clean.
- "Canonical exercise names" is trust-the-model for now. If we see garbage or inconsistent naming, add a server-side normalisation pass or an `exercise_library` lookup (currently deferred).
- Regenerating is unconfirmed (no key). When it runs, the UI swaps in-place and the old row is archived — archived plans aren't surfaced anywhere yet; future "history" view could list them.
- Onboarding still doesn't capture equipment list or environment explicitly (only AI can infer from `environment` field). REQs §3 equipment audit is partially covered by the free-form personality/environment fields but not as a structured list. Real equipment screen is a future pass.
- No notion of "today's session" yet — plan is a weekly template. Scheduling (Phase 5b) converts that template into concrete day-stamped sessions.

**Verification:**
- `npm run typecheck` across 3 workspaces: passes.
- `wrangler d1 migrations apply mai-db --local`: `0003_workouts.sql` applied (4 commands including the partial unique index).
- `wrangler dev` boots on :8787.
- `GET /health` → `{ok: true}` ✓
- `GET /workouts/current` no auth → 401 ✓
- `GET /workouts/current` authed, no plan → `{plan: null}` ✓
- `POST /workouts/generate` authed, no profile row → 409 `profile_incomplete` ✓
- Inserted a fake profile row, retried `POST /workouts/generate` → 503 `ai_not_configured` with `ANTHROPIC_API_KEY is not configured` message ✓
- Inserted a fake active plan with the correct JSON shape, `GET /workouts/current` → returned the full structured plan ✓
- Cleaned up test rows from D1 at end of smoke test.
- **Not verified:** real Anthropic round-trip (generation end-to-end, tool-call parsing, archive-on-regen flow). Requires `ANTHROPIC_API_KEY`. Mobile UI still only typechecked, not device-tested.

---

## 2026-04-22 — pass-2-ai-provider-abstraction-and-conversational-onboarding

**What:**
- **AI provider abstraction** (`apps/api/src/lib/ai/`): `Provider` interface with `chat(req)`, concrete `OpenAIProvider` and `AnthropicProvider`, `getProvider(env, role)` factory parsing `AI_MODEL_<ROLE>` as `<provider>/<model>` with TECH.md defaults (chat=openai/gpt-4o-mini, planning=anthropic/claude-3-5-sonnet-latest, vision=openai/gpt-4o). Shared `ToolDefinition` / `ToolCall` types translated to each vendor's shape. System prompt hoisted out on Anthropic; tool results wrapped as `user` `tool_result` blocks.
- **D1 migration `0002_onboarding.sql`**: `conversations(id, user_id FK, kind, created_at, completed_at)`, `messages(id, conversation_id FK, role, content, tool_calls JSON, tool_call_id, created_at)`, `profiles(user_id PK FK, data JSON, created_at, updated_at)`. Profile schema stays in TS (`packages/shared/src/onboarding.ts`) to avoid migration churn.
- **Worker routes** (`apps/api/src/routes/chat.ts`, `routes/profile.ts`): `POST /chat/onboarding/start` (idempotent — resumes existing if present), `POST /chat/onboarding/:id/send`, `GET /chat/onboarding/:id`, `GET /me/profile`. DB helpers in `src/lib/db.ts` extended with conversation/message/profile ops plus a `listRawMessages` that returns full context (including tool turns) for AI rebuilds.
- **Onboarding prompt & tool** (`apps/api/src/prompts/onboarding.ts`): gritty system prompt covering the six discovery areas from REQs.md §2, canned `ONBOARDING_OPENER` so the first assistant turn is instant (no provider call), and a `save_profile` tool with structured schema + `wrap_up_message` field. Tool call persists the profile and marks the conversation complete in one turn.
- **Mobile (`apps/mobile/`)**: extended `AuthProvider` to hold `{profile, onboardingConversationId, refreshProfile}`, fetched on hydrate + sign-in. New `src/lib/onboarding.ts` client. New `app/(app)/onboarding.tsx` chat screen — FlatList of bubbles, `KeyboardAvoidingView`, optimistic user message on send, auto-scroll, redirects home after completion. Home screen (`app/(app)/index.tsx`) now gates between onboarding CTA and profile summary based on `profile` state.
- **Env contract**: `.dev.vars.example` expanded with `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_MODEL_*`. `env.ts` typed accordingly.
- **ARCHITECTURE.md**: routes table expanded; new sections for onboarding schema, AI abstraction, env vars; Phase 2 & 3 removed from future table; streaming of `/send` explicitly deferred.

**Why:**
User said "keep going". Phase 2 (AI abstraction) alone has nothing user-visible, so I bundled it with Phase 3 (the feature that proves the abstraction works). Onboarding is the natural first AI feature — it's what the REQs open with, and once a profile exists everything downstream (workouts, notifications) has something to read. Keeping the AI conversation history as real DB rows (not reassembled from a blob) makes Phase 6's "real-time adjustments" trivial later — same shape, different `kind`.

**Follow-ups:**
- Real AI call not exercised locally — requires `OPENAI_API_KEY` in `.dev.vars`. Without one, `/send` correctly 503s and the mobile UI alerts. Tool-use round-trip with a real provider is still unverified in isolation.
- Streaming (SSE) for `/send` deferred. First-turn canned opener means onboarding feels responsive even without streaming on subsequent turns; revisit when real-world latency data says otherwise.
- Anthropic stop-reason mapping is conservative (everything unknown → `"other"`). If we see real tool-use failures, revisit.
- `save_profile` tool schema is opinionated (primary_goals + wrap_up_message required). If the model calls it prematurely, we'll see incomplete profiles. No hard validation beyond type checks — worth adding a "profile completeness" server-side heuristic later if it becomes a problem.
- `wrangler` still on 3.114; upgrade to 4.x deferred until we have a reason.
- Voice input (`expo-speech-recognition`) not wired into the onboarding chat yet. User deferred to a later phase.

**Verification:**
- `npm run typecheck` across 3 workspaces: passes.
- `wrangler d1 migrations apply mai-db --local`: applied cleanly (7 commands). `SELECT name FROM sqlite_master` confirms `users`, `conversations`, `messages`, `profiles`.
- `wrangler dev` boots on :8787.
- `GET /health` → `{ok: true}` ✓
- `GET /me/profile` no auth → 401 ✓
- `POST /chat/onboarding/start` no auth → 401 ✓
- Inserted test user (`test-user-1`), minted a dev JWT with `scripts/mint-dev-jwt.mjs` against the same `JWT_SECRET`:
  - `GET /me` → returns the test user ✓
  - `GET /me/profile` → `{profile: null, onboardingConversationId: null}` ✓ (first-time user)
  - `POST /chat/onboarding/start` → returns conversation + opener assistant message ✓
  - Second call returns the same conversation (idempotent) ✓
  - `POST /chat/onboarding/:id/send` without `OPENAI_API_KEY` → 503 `ai_not_configured` ✓
  - `GET /chat/onboarding/:id` → conversation + message list ✓
- Caught and fixed an ordering bug: the 503 path originally persisted the user message before the provider check. Provider check moved above the DB write; typecheck re-passed.
- **Not verified:** full AI round-trip (send → assistant reply → eventual tool call → profile saved). Requires API keys. Mobile UI not exercised on device — only typechecked.

---

## 2026-04-22 — bootstrap-pass-1-foundation-and-google-auth

**What:**
- Initialised npm workspace monorepo: `apps/mobile` (Expo 54 + Expo Router), `apps/api` (Cloudflare Worker + Hono + D1), `packages/shared` (User + API contract types consumed as source `.ts`).
- Root tooling: `package.json` with workspace scripts (`dev:api`, `dev:mobile`, `typecheck`, `migrate:local`), `tsconfig.base.json` (strict + `noUncheckedIndexedAccess` + Bundler resolution), `.gitignore`, `.editorconfig`.
- **Worker (`apps/api`):** Hono app with `/health`, `POST /auth/google`, `GET /me`. Auth lib: HS256 JWT sign/verify via Web Crypto (no `Buffer` — uses `btoa`/`atob` + `TextEncoder`). Google ID token verifier fetches JWKS with `caches.default` hourly cache, validates RS256 signature + `iss`/`aud`/`exp`/`email_verified`. D1 `upsertUser` keyed by `google_sub`. `requireAuth` middleware loads user into Hono context. CORS driven by `ALLOWED_ORIGINS` env var.
- **D1 schema (`migrations/0001_init.sql`):** `users(id, google_sub UNIQUE, email, name, picture, created_at, updated_at)` + `idx_users_email`.
- **Mobile (`apps/mobile`):** Expo Router file-based routing. `AuthProvider` (loading → signedOut/signedIn) persists JWT in `expo-secure-store`, hydrates via `GET /me`, clears token on 401. Sign-in screen with `expo-auth-session` Google OAuth, gritty dark-mode styling (colors in `src/theme/colors.ts`). Authenticated home screen shows email + sign-out. Auth gate redirect logic in root `_layout.tsx` using `useSegments`.
- **Docs:** `CLAUDE.md` codifies the dev-notes + architecture-doc obligations. `ARCHITECTURE.md` is the living system description (routes, schema, auth flow, env vars, future-phase hooks). `SETUP.md` walks through GCP OAuth setup, `.dev.vars`, running both dev servers, and the smoke-test flow.

**Why:**
User handed over a greenfield repo with only `REQs.md` and `TECH.md` and said "start building the roadmap". Plan mode settled on "Foundation + Auth only" for Pass 1 so the first integration is end-to-end-verifiable rather than eight phases of stubs. User also explicitly chose `expo-auth-session` (works in Expo Go) over native Google Sign-In, device-native STT for later phases, and keeping TECH.md's model versions as-is.

**Follow-ups:**
- `wrangler.toml` uses a placeholder `database_id` — works for local dev, must be replaced with the output of `wrangler d1 create mai-db` before any remote deploy.
- `GOOGLE_CLIENT_ID` is a placeholder string — user must fill it in from GCP Console per `SETUP.md` step 2.
- `JWT_SECRET` in `.dev.vars` is a placeholder; real deployment needs `wrangler secret put JWT_SECRET`.
- SHA-1 fingerprint for the Android OAuth client isn't generated yet — Expo Go uses Expo's generic fingerprint, so this only becomes a blocker when moving to a dev build.
- `wrangler` pinned at 3.114 — 4.x is available but holds breaking changes. Revisit before production deploy.
- Future phases (2–8) reserved in `ARCHITECTURE.md` → "Future-phase integration points"; none implemented.

**Verification:**
- `npm install` at repo root: clean, 0 vulnerabilities after `npx expo install` normalized Expo SDK 54 compatible versions.
- `npm run typecheck` across all three workspaces: passes.
- `npm run migrate:local -w @mai/api`: applied `0001_init.sql` to local SQLite; `SELECT name FROM sqlite_master` confirms `users` table.
- `npx wrangler dev --port 8787`: started successfully.
- `GET /health` → `{"ok":true}` ✓
- `GET /me` (no auth) → HTTP 401 `{"error":"missing_bearer"}` ✓
- `POST /auth/google` with empty body → HTTP 400 `{"error":"missing_id_token"}` ✓
- `POST /auth/google` with fake idToken → HTTP 401 `{"error":"invalid_id_token"}` ✓
- **Not verified:** real Google OAuth flow end-to-end — requires GCP Console setup (OAuth clients) which is a manual user step. The code path is wired, the Worker rejects invalid tokens correctly, and the mobile screens render, but a successful sign-in has not been exercised against a real Google `id_token`.
