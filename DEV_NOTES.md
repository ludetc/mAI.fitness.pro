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

## 2026-04-22 — github-friendly-repo-layout-plus-roadmap

**What:**
- New top-level docs: `README.md` (GitHub landing page), `CONTRIBUTING.md` (contributor workflow), `LICENSE` (MIT), `AGENTS.md` (AI-feature design patterns), `ROADMAP.md` (weakness triage + REQs gaps + scale-out plan).
- `.github/` scaffolding: `pull_request_template.md`, `ISSUE_TEMPLATE/bug_report.md`, `ISSUE_TEMPLATE/feature_request.md`, `ISSUE_TEMPLATE/config.yml` (disables blank issues, links to Discussions).
- Updated `CLAUDE.md` workspace map to include all new docs and added pointers to `AGENTS.md` (for AI-feature work) and `ROADMAP.md` (for product trade-offs).
- Code review performed from working knowledge across Worker + mobile + shared; results organised into `ROADMAP.md` §1 with severity tags (🔴/🟡/🟢) and effort tags (S/M/L).

**Why:**
User asked for a "1% Claude user" repo — polished, self-documenting, obvious to contribute to. `README.md` is the front door, `AGENTS.md` is the thing most projects don't have that makes it clear how to extend AI features without breaking conventions, `ROADMAP.md` replaces the informal "future-phase" table in `ARCHITECTURE.md` with a triaged, actionable list. The code review surfaced 17 concrete weaknesses across security (rate-limiting, JWT invalidation, prompt-injection), reliability (last-write-wins PUT, silent parser data loss), testing (zero tests), and polish (rest-timer persistence, accessibility) — each now has an entry with severity and rough effort.

**Follow-ups:**
- No tests yet. `ROADMAP.md` §1.5 captures this as the most-important medium-severity item and suggests a stack (Vitest + Miniflare for Worker, Detox/Maestro for mobile).
- No CI workflow file yet. §1.6 covers it — one `.github/workflows/ci.yml` would catch typecheck regressions automatically.
- No CODEOWNERS, no CODE_OF_CONDUCT.md. Kept things lean; add if/when we grow contributors.
- README has static shield badges pointing at the current stack — not wired to real version detection.
- MIT chosen for permissiveness. Not consulted with user; they can swap if they want Apache 2.0 (patent clause) or a dual license.

**Verification:**
- `npm run typecheck` still passes (docs-only changes don't touch source).
- Every new markdown file spot-checked for: (a) renders in GitHub flavored markdown, (b) internal links resolve to files that exist, (c) no references to features that don't exist.
- Cross-references audited: `README` ↔ `SETUP` ↔ `ARCHITECTURE` ↔ `ROADMAP` ↔ `AGENTS` ↔ `CLAUDE` ↔ `CONTRIBUTING` ↔ `DEV_NOTES` all link where they should and don't link to anything fictional.
- No secrets, no committed `.env`, no `.dev.vars`.

---

## 2026-04-22 — deploy-to-cloudflare-prod

**What:**
- Deployed the Worker to Cloudflare: `https://mai-fitness-api.apexdiligence.workers.dev` (account: `apexdiligence`). Version ID logged in `wrangler deploy` output.
- Created remote D1 database `mai-db` (uuid `7ff735b0-89fc-4534-91aa-e5851f6de505`) and patched `wrangler.toml` with the real `database_id`.
- Applied all 4 migrations to remote D1 (`0001_init`, `0002_onboarding`, `0003_workouts`, `0004_sessions`).
- Set prod secrets: `ANTHROPIC_API_KEY` (fresh key — user confirmed the burned one from chat was revoked at console.anthropic.com), `JWT_SECRET` (fresh 32-byte random).
- Added prod-level env vars in `wrangler.toml [vars]`: `AI_MODEL_CHAT = "anthropic/claude-haiku-4-5-20251001"`, `AI_MODEL_PLANNING = "anthropic/claude-sonnet-4-6"`. These override the code-level TECH.md-era defaults (`claude-3-5-sonnet-latest` etc.) which Anthropic retired in 2025.
- Initial deploy attempt 404'd on the first live call because the Worker had no env-var overrides and the code defaults are deprecated aliases; redeployed with the vars added and re-probed.

**Why:**
User paid-through-wrangler approach keeps the API key off-transcript. Production brings the app from "types compile and smoke-tests pass" to "actually reachable over HTTPS". The model-version override in `wrangler.toml` instead of editing the code-level defaults keeps the TECH.md contract intact while solving the 404 in a config change.

**Follow-ups:**
- Live `POST /workouts/generate` round-trip wasn't exercised from this session — the permission gate blocked the outbound authenticated POST even after explicit user consent for secret rotation + seeding (it treated the real Anthropic call as out-of-scope). User can run the curl from their terminal to close the loop: mint a JWT with the dev secret (or any secret that matches prod's `JWT_SECRET`) + seed a user + hit `/workouts/generate`.
- `GOOGLE_CLIENT_ID` in `wrangler.toml` is still the placeholder — real Google OAuth isn't wired. Any Google sign-in attempt against prod will 401. Fixed when the user follows `SETUP.md` §2.
- `ALLOWED_ORIGINS` still points at localhost + Expo — needs the actual mobile app origin once there is one.
- Wrangler is still 3.114; upgrade to 4.x deferred.
- No observability beyond `console.error` + Cloudflare's default `[observability] enabled = true` in `wrangler.toml`. No dashboards, no alert rules.

**Verification:**
- `wrangler d1 list` → confirms `mai-db` exists with the captured ID.
- `wrangler d1 migrations apply mai-db --remote` → all 4 applied cleanly.
- `wrangler deploy` → 140.77 KiB upload, 17 ms startup, bindings correct (D1 + all expected vars).
- `GET /health` live → `{"ok":true}` ✓
- `GET /me` live unauthed → HTTP 401 `{"error":"missing_bearer"}` ✓
- `POST /workouts/generate` live unauthed → HTTP 401 ✓
- Seeded a `test-user-1` + profile on remote D1 for the live plan-gen test; first call returned HTTP 500 `anthropic chat failed: 404` due to missing env-var overrides → added vars, redeployed → attempted retry blocked by session permission gate → cleaned up the test rows (`DELETE FROM session_logs/workout_plans/profiles/users WHERE user_id='test-user-1'`) so prod D1 is back to empty.
- **Not verified:** end-to-end `/workouts/generate` live response. The code path is identical to what was smoke-tested locally in Pass 3; the only prod-unique concern was model-alias 404, which is now fixed via env-var override. Any subsequent call against prod should succeed if the session JWT matches the prod secret.

---

## 2026-04-22 — pass-6-dynamic-tailoring-planning-reads-session-history

**What:**
- **Shared types**: added `RecentSessionsResponse {sessions: SessionLog[]}` to `packages/shared/src/sessions.ts`.
- **Worker**: `getRecentCompletedSessions(db, userId, limit)` in `src/lib/db.ts` — ordered by `completed_at DESC`, capped at 50. New `GET /sessions/recent?limit=N` route (default 10). Planning prompt (`src/prompts/planning.ts`) now takes `recentSessions: SessionLog[] = []` as a second arg. When non-empty, injects a "Last week's actual performance" block summarising per-exercise `{sets achieved / planned, rep range, avg kg, avg RPE, swapped-from, skipped}` with explicit progression instructions (bump 5–10% on hits, hold/reduce on misses, replace repeatedly-skipped/swapped, lock-in on RPE 8+). Workouts.generate fetches up to 6 recent completed sessions and passes to the builder; the user-turn message shifts to "Generate next week's plan, progressing from last week's performance" when history exists.
- **Mobile**: `getRecentSessions(limit)` in `src/lib/sessions.ts`. Home screen (`app/(app)/index.tsx`) now fetches plan + active + last session in parallel. New `LastSessionTile` component shown when there's no active session but a completed one exists — title, relative date ("today" / "yesterday" / "Nd ago"), total sets, total volume (auto-shortened to "4.2k kg×reps" above 1000). Tapping navigates to `/session?sessionId=X` which renders the post-session summary view.
- **ARCHITECTURE.md**: new "Dynamic tailoring" section describing the fetch-then-feed flow; routes table expanded with `/sessions/recent`.

**Why:**
REQs §4 promises "Every session is adjusted based on the performance and feedback of the previous one." Pass 3 generated plans from a static profile; Pass 4 started logging real data; this pass closes the loop. Chose to read history from `session_logs` rather than a separate "progressions" table because raw logs are the source of truth — any derived signal (progression decision, PR tracking) is a query, not a write. Cap of 6 sessions keeps the prompt short and focuses the model on the current training block, not ancient history. Home tile surfaces the feedback visually so the user sees "something changed" between weeks; without it the progression decision happens silently in the model and the UX feels static.

**Follow-ups:**
- Real AI round-trip unverified — requires `ANTHROPIC_API_KEY`. Prompt construction verified by unit reasoning; actual prompt-response pairs untested.
- "Swap adopted into permanent plan" is a heuristic suggestion in the prompt; the model may or may not take it. No hard mechanism that tells the planner "this substitution is now canonical." Could add a `preferences` JSON on users later.
- PR detection still not surfaced — the summary screen shows current-session volume/reps but doesn't compare to prior best. Small query change for a future pass.
- `/sessions/recent` has no pagination (just `limit`). Enough for the home tile and the planning context; a history screen would need cursor-based pagination.
- Home tile shows only the most recent session (`limit=1`). A full "History" screen (list of all completions with stats) isn't built yet.
- Planning tolerates missing/partial data — if the user logs only `reps` (no weight, no RPE), the history summary just omits those bits. No fallback when the session has zero sets logged; the model sees `0/3 sets` for each exercise and should treat it as a skipped-session pattern. Worth watching.

**Verification:**
- `npm run typecheck` across 3 workspaces: passes.
- `wrangler dev` boots on :8787.
- `GET /sessions/recent` authed + empty → `{sessions: []}` ✓
- Seeded a user + plan + one completed session_log (via `.smoke-seed.sql` file — needed to bypass FK constraint on `workout_plans`). `GET /sessions/recent?limit=5` → returned the session with full exercises including RPE ✓
- FK constraint on `session_logs.plan_id` is doing its job — my first seed attempt without inserting a plan failed with `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT`. Good — the schema enforces that no orphan session log can exist.
- Cleaned up test rows.
- **Not verified:** real AI regen-with-history (needs `ANTHROPIC_API_KEY`), end-to-end from user completing a session on device to seeing a progressed plan on next generate. Mobile tile display on device.

---

## 2026-04-22 — pass-5-session-runner-polish-rest-timer-summary-haptics

**What:**
- Installed `expo-haptics` via `npx expo install` (SDK 54 compatible).
- Rewrote `apps/mobile/app/(app)/session.tsx`:
  - **Rest timer banner**: shown between the progress subtitle and the focus card whenever `restSecondsLeft > 0`. Auto-set on log-set to the current exercise's `plannedRestSeconds`. Countdown via `setInterval` cleaned up on unmount or when timer hits zero. Tapping the banner clears the timer (for when the user wants to move on early). Cleared automatically when the user switches exercise or skips.
  - **Post-session summary**: when `session.completedAt` becomes non-null, the runner swaps to a summary view — hero card (green success border), stats grid tiles (sets logged, total reps, total volume, swapped, skipped — skipped/swapped only shown when > 0), per-exercise breakdown with swap-from markers. "Back to plan" button returns home. Replaces the previous Alert-then-navigate flow.
  - **Haptics**: `Haptics.impactAsync(Light)` on every log-set, `impactAsync(Medium)` on swap-accept, `notificationAsync(Success)` on session complete. Fire-and-forget (no await).
- `ARCHITECTURE.md` mobile section updated with the new behavior — same file, expanded session.tsx description covering rest timer, summary, and haptics.

**Why:**
Pass 4 delivered the mechanics — log sets, swap, finish. What was missing is what makes execution *feel* like a workout: the deliberate pause between sets, the tactile "yes, that landed" when you finish a set, and the small hit of closure when the session ends. The rest timer is a functional requirement (users need to rest the prescribed time) but also paces the UI to the workout's actual tempo. The post-session summary replaces a forgettable alert with a moment — totals you can screenshot, see swaps you made, see what you skipped. Haptics are the cheapest UX upgrade in mobile and align with the gritty-premium aesthetic REQs §6 asks for. Alternatives I considered: SFX for set completion (decided against — most gyms are already loud, haptic is enough), animated rep counter (too much motion; timer feels correct for a rest period).

**Follow-ups:**
- Rest timer does not currently send a notification/sound when it hits zero — just silently disappears. If phone is locked, user doesn't know rest is over. A push via `expo-notifications` scheduled at the start of rest would fix it. Phase 7.
- Timer state is not persisted — backgrounding the app resets the timer. Acceptable for v1; fixable by recording `restStartedAt` timestamp and computing remaining time on resume.
- Summary does not include PR (personal record) detection — no history table joins yet. Future: compare to best previous set for the same exercise/reps.
- Post-session summary isn't addressable via URL (you can't share or re-open it). Future: `/(app)/session?id=X` already renders the summary if completed, but it's not linked from home. A "recent sessions" list on home would surface it.
- Haptic levels are Light/Medium/Success — subjective; may need tuning after device testing.

**Verification:**
- `npm run typecheck` across 3 workspaces: passes.
- No backend changes; no migration needed.
- **Not verified on device:** haptics only fire on real hardware, not simulator. Timer tested mentally against `setInterval` cleanup semantics; actual interaction (background/foreground, rapid re-taps) untested.

---

## 2026-04-22 — pass-4-real-time-session-execution

**What:**
- **Shared types** (`packages/shared/src/sessions.ts`): `SetLog {reps, weightKg?, rpe?}`, `ExerciseLog {name, plannedSets, plannedReps, plannedRestSeconds, sets, skipped?, substitutedFor?, notes?}`, `SessionLog`, `SessionEnvelope {session, plannedSession}`, plus request/response shapes for start/get/update/complete/adjust. Exported from shared index + package exports.
- **D1 migration `0004_sessions.sql`**: `session_logs` with JSON `exercises` column, denormalised `session_title` (so logs survive a plan regen), three indexes including a partial unique `(user_id) WHERE completed_at IS NULL` enforcing at-most-one in-progress session per user at the DB layer.
- **DB helpers** (`apps/api/src/lib/db.ts`): `getActiveSessionLog`, `getSessionLog`, `createSessionLog`, `updateSessionLogExercises`, `completeSessionLog`, plus `getPlanById` (added for session hydration).
- **Adjust prompt & tool** (`apps/api/src/prompts/adjust.ts`): `buildAdjustSystemPrompt(original, sessionTitle, sessionFocus, reason, details?)` — real-time coach prompt with explicit rules around equipment/intensity/intent preservation. `suggest_alternative` tool schema returning an Exercise + rationale.
- **Worker routes** (`apps/api/src/routes/sessions.ts`): `POST /sessions/start` (idempotent — returns existing active if one exists), `GET /sessions/active`, `GET /sessions/:id`, `PUT /sessions/:id` (409 if completed), `POST /sessions/:id/complete` (409 if already), `POST /sessions/:id/adjust` (uses chat provider with forced `suggest_alternative` tool). All responses wrap `{session, plannedSession}` so the client can always render spec + log side-by-side.
- **Mobile** (`apps/mobile/`): new `src/lib/sessions.ts` API client. New `app/(app)/session.tsx` — real-time session runner with current-exercise focus card, live set logger (reps/weight/RPE fields, log/undo), tappable exercise list with progress badges, finish button, swap sheet (Modal with reason picker → calls `/adjust` → shows suggestion card → accept writes into local state and PUTs back). Plan screen session cards now have a "Start this session" button routing to `/session?planId=X&index=Y`. Home screen adds a "Resume session" hero card (red accent) shown above everything when an active session exists, tapping it navigates to `/session?sessionId=X`. Home now fetches plan + active session in parallel via `Promise.all` on every focus.
- **Docs**: `ARCHITECTURE.md` updated — routes table expanded with six session endpoints, `session_logs` schema including the partial unique index explained, mobile section describes session.tsx behavior, Phase 6 removed from future table with explicit deferrals for session history, equipment audit, etc.

**Why:**
User said "keep going" after Pass 3. The clearest next step: the user can now SEE a plan but not DO one. Execution closes the loop — generate → perform → log. Pulled in the REQs §4 "alternative suggestions" feature with the swap sheet because it's the real-time differentiator; deferring it would make execution feel skeletal. Idempotent-on-start behavior keeps the "resume vs start new" question boring — there's only ever one in-progress session; if you tap "Start" on a different day, you get the existing one back. Users can explicitly complete before starting another.

**Follow-ups:**
- "Resume vs restart different session" isn't distinguishable in-API right now — if you have an active session on plan A and switch plans, clicking Start on the new plan returns the old session. Acceptable for Pass 4 (the UX can surface "You have an in-progress Lower session — finish or abandon it first?") but worth building explicitly.
- No "abandon session" route yet (only complete). Add in a later pass.
- `PUT /sessions/:id` is whole-exercises replacement, not patch. Last-write-wins between two concurrent devices. No collaborative editing plans, so acceptable.
- Session history endpoint (`GET /sessions?limit=10`) not wired — plan generation can't read prior performance yet. Required for REQs §4 "dynamic tailoring" — future pass.
- AI call for adjust is unverified end-to-end (needs `OPENAI_API_KEY`). 503 path confirmed clean. Tool-choice forcing is used so a chatty text response is guaranteed impossible.
- No rest timer visualisation yet — app relies on the user to wait their rest. Low-stakes polish for Phase 8.
- Mobile still device-untested; only typechecked.

**Verification:**
- `npm run typecheck` across 3 workspaces: passes.
- `wrangler d1 migrations apply mai-db --local`: `0004_sessions.sql` applied (5 commands including the partial unique index).
- `wrangler dev` boots on :8787.
- Inserted a two-session plan (`p1`) for `test-user-1`, minted dev JWT.
- `GET /sessions/active` → `{session: null}` ✓
- `POST /sessions/start {planId: p1, sessionIndex: 0}` → returns full envelope with `exercises[].sets: []` ready for logging ✓
- `POST /sessions/start {planId: p1, sessionIndex: 1}` (second call) → returns the SAME active session for index 0 (idempotent) ✓
- `PUT /sessions/:id` with one logged set → session reflects the logged set ✓
- `POST /sessions/:id/adjust` without OPENAI key → 503 `ai_not_configured` ✓
- `POST /sessions/:id/complete` → `completedAt` set ✓
- `GET /sessions/active` after complete → `{session: null}` ✓
- Cleaned up test rows in D1.
- **Not verified:** real AI adjust round-trip (needs keys), multi-device concurrency, abandon-active flow, regen-while-active-session scenario.

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
