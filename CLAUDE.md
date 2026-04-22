# CLAUDE.md

Guidance for Claude (and any AI coding agent) working in this repo. These rules override default behavior.

---

## Standing obligations (do these without being asked)

### 1. Dev notes before every commit — non-negotiable

**Before every `git commit`, append a dated entry to `DEV_NOTES.md` at the repo root** — even if the user did not ask, even if the change seems trivial, even on hotfixes. If `DEV_NOTES.md` does not exist, create it.

Each entry MUST include:

- **Date** in `YYYY-MM-DD` format and a short slug title
- **What changed** — concrete list of files/areas touched
- **Why** — the motivation, constraint, or user ask that prompted the change (not just what the code does)
- **Follow-ups / known gaps** — anything left incomplete, deferred, or flagged for later
- **Verification** — what you actually ran/tested to believe the change works (typecheck, `wrangler dev` + curl, UI walkthrough, etc.). If you could not verify, say so explicitly.

Entry template:

```markdown
## YYYY-MM-DD — slug-title

**What:** …
**Why:** …
**Follow-ups:** …
**Verification:** …
```

New entries go at the **top** of `DEV_NOTES.md` (reverse-chronological). Do not rewrite old entries.

If you are about to commit and realise a note is missing, **stop, write the note, then commit**. Do not commit first "and add the note next."

### 2. Update `ARCHITECTURE.md` whenever architecture changes

`ARCHITECTURE.md` is the living source of truth for the system's shape. Update it in the **same commit** as the change whenever any of the following happens:

- A new workspace, top-level module, or service is added or removed
- A new D1 table, migration, or schema change is introduced
- A new route/endpoint is added, renamed, or removed
- The auth flow, session model, or trust boundary changes
- A new external dependency (API, SDK, storage bucket) is integrated
- The build, deploy, or environment-variable contract changes
- A cross-cutting pattern (error handling, logging, provider abstraction) is introduced

If the change is purely internal to one file and does not alter any of the above, `ARCHITECTURE.md` does **not** need an update — but if in doubt, update it.

### 3. Keep `CLAUDE.md` itself honest

If a rule here becomes obsolete or you discover a better convention that the team adopts, update this file in the same commit. Don't leave stale rules around to rot.

---

## Workspace map

```
mAI.fitness.pro/
├── apps/
│   ├── mobile/       # Expo (React Native) app — Expo Router, TypeScript
│   └── api/          # Cloudflare Worker — Hono, D1, TypeScript
├── packages/
│   └── shared/       # Cross-workspace TypeScript types & API contracts
├── CLAUDE.md         # ← you are here
├── ARCHITECTURE.md   # living architecture doc (keep current)
├── DEV_NOTES.md      # reverse-chronological dev log (append before every commit)
├── REQs.md           # product requirements (read-only, authoritative spec)
├── TECH.md           # tech stack decisions (read-only, authoritative)
└── SETUP.md          # local setup instructions
```

Workspace names are npm-scoped: `@mai/mobile`, `@mai/api`, `@mai/shared`.

---

## Conventions

### General

- **Node** ≥ 20, **npm workspaces** (not pnpm). Don't reintroduce pnpm without discussing.
- **TypeScript strict** everywhere, including `noUncheckedIndexedAccess`. Do not loosen.
- **No default exports** in shared packages; prefer named exports for refactor-friendliness.
- **No comments explaining WHAT code does** — only WHY when the why is non-obvious (subtle invariant, workaround, hidden constraint). If removing the comment wouldn't confuse a future reader, don't write it.
- Follow the spec in `REQs.md` and `TECH.md`. If you want to deviate, call it out in `DEV_NOTES.md` with a "Why" justification.

### Cloudflare Workers (`apps/api`)

- **No `Buffer`** — it's not available in the Workers runtime. Use `btoa()`/`atob()` with `TextEncoder`/`TextDecoder` for base64 and byte work.
- **Service bindings** use `env.SERVICE.fetch(new Request('https://service/path', …))` with a fake host and a real route.
- Durable Objects must be re-exported from `src/index.ts`.
- `scheduled()` handler uses `ctx.waitUntil()` for async cron work.
- All handlers should accept the Hono context and pull `user` from `c.get('user')` when behind auth middleware.
- Secrets (`JWT_SECRET`, future API keys) live in `.dev.vars` locally and `wrangler secret put` in production. **Never commit secrets.**

### Expo app (`apps/mobile`)

- Expo Router file-based routing. Auth gate lives in the root `_layout.tsx`.
- Session JWT stored in `expo-secure-store` — **never** `AsyncStorage` for tokens.
- API calls go through `src/lib/api.ts`, which attaches the Bearer header.
- Platform-specific Google client IDs come from `EXPO_PUBLIC_GOOGLE_CLIENT_ID_*` env vars.

### Shared package (`packages/shared`)

- Exports TypeScript sources directly (no build step) — both the Worker and the Expo bundler handle `.ts` natively.
- This is the contract. If you change a shared type, both sides must update in the same commit.

---

## Git hygiene

- Create **new commits** rather than amending unless the user explicitly asks.
- Never `--no-verify`, never `--force` unless explicitly authorised.
- Stage specific files; avoid `git add -A` (risks pulling in `.env`, build artefacts).
- Use imperative-mood commit subjects: `add google id token verification`, not `added` / `adds`.
- Commit body should briefly explain **why**; the **what** is in the diff.
- Reference the relevant `DEV_NOTES.md` section by date if the change is substantial.

---

## Testing & verification

There is no CI yet. Until there is, **you** are the verification:

- Run `npm run typecheck` across all workspaces after any TS change.
- For Worker changes: `npm run dev:api`, then `curl` the affected route. `/health` should always return `{"ok":true}`.
- For mobile changes: open the app in Expo Go (iOS/Android) or `w` for web, walk through the user-facing path.
- Record what you ran in the `Verification` section of the `DEV_NOTES.md` entry.

If verification is impossible in this environment (e.g. needs a real GCP OAuth setup), say so in the dev note. Do not claim success you cannot prove.

---

## Out of scope until explicitly asked

- Production deployment, CI/CD, custom domains.
- Analytics, telemetry, crash reporting.
- Migrations destructive to user data (dropping columns, renaming in place).
- Any action that touches a production Cloudflare account or Google Cloud project.

---

## TL;DR for the agent

1. **Every commit → a dev note in `DEV_NOTES.md`**, even without being asked.
2. **Architecture change → update `ARCHITECTURE.md` in the same commit.**
3. **Strict TS, no `Buffer`, secrets in `.dev.vars`, session JWT in secure-store.**
4. **Verify and report honestly.** If you didn't run it, say so.
