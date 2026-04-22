# Contributing to mAI.fitness.pro

Thanks for the interest. This repo is small and opinionated; that's on purpose. Please read this whole page before opening a PR — it'll save us both time.

## Before you start

Read these, in order:

1. [`README.md`](./README.md) — what the product is
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how the pieces fit
3. [`CLAUDE.md`](./CLAUDE.md) — the standing obligations for every commit (yes, dev notes are mandatory)
4. [`AGENTS.md`](./AGENTS.md) — if you're touching AI features
5. [`ROADMAP.md`](./ROADMAP.md) — what we're planning; check whether your idea is already scheduled or explicitly out-of-scope

## Setup

Follow [`SETUP.md`](./SETUP.md). First-time setup is ~30 minutes; after that:

```bash
npm run typecheck        # across all three workspaces
npm run dev:api          # wrangler dev on :8787
npm run dev:mobile       # expo start
```

## The deal

### 1. Every commit gets a `DEV_NOTES.md` entry

Non-negotiable, per `CLAUDE.md`. Top of file, newest first, format:

```markdown
## YYYY-MM-DD — short-slug

**What:** concrete file/area list
**Why:** the motivation, not the mechanics
**Follow-ups:** what's deferred or unfinished
**Verification:** what you actually ran
```

If you didn't verify something, say so. "Typecheck passes, did not exercise on a device" is acceptable. "Works" when you only compiled is not.

### 2. Architecture changes update `ARCHITECTURE.md` in the same commit

New workspace, new route, new D1 table, new external dep, auth model change → `ARCHITECTURE.md` gets edited. No separate "docs" commits after the fact.

### 3. TypeScript strict everywhere

- `noUncheckedIndexedAccess` is on. Don't turn it off.
- No `any`. `unknown` + narrowing is fine.
- Shared types live in `packages/shared` and are the contract. If you change a shared type, both sides (worker + mobile) update in the same commit.

### 4. No invented guarantees

- Don't add error handling for things that cannot happen. Don't catch an error just to rethrow it. Don't add feature flags for features that aren't flagged.
- Only validate at system boundaries (user input, AI responses, third-party APIs). Internal calls are trusted.
- No comments explaining **what** code does — names handle that. Comments only for **why** (hidden constraint, workaround, surprise).

### 5. Workers runtime gotchas

Living in `CLAUDE.md`, but the short version:
- No `Buffer`. Use `btoa`/`atob` + `TextEncoder`/`TextDecoder`.
- Service bindings via `env.SERVICE.fetch(new Request(…))`.
- Durable Objects re-exported from `src/index.ts`.
- Cron work in `scheduled()` uses `ctx.waitUntil()`.

### 6. Secrets

- `apps/api/.dev.vars` — local, gitignored. Never commit.
- `apps/mobile/.env` — local, gitignored. Never commit.
- Prod secrets: `npx wrangler secret put NAME` (interactive prompt). Never pipe from a file that's in a commit history.

## Workflow

1. Create a branch: `feature/short-slug` or `fix/short-slug`.
2. Do the work. Keep commits small and coherent; large mixed-purpose commits get asked to be split.
3. `npm run typecheck` passes locally.
4. Open a PR against `main`. Use the template (`.github/pull_request_template.md`).
5. Link related issues in the PR body.
6. Review happens in the PR. Address feedback in new commits; we squash at merge time (so local commit hygiene matters less than keeping the conversation clear).

## Adding a new AI feature

Read [`AGENTS.md`](./AGENTS.md) first. Short version: new system prompt in `apps/api/src/prompts/`, new tool definition colocated with it, new route that calls `getProvider(env, role)` with `toolChoice: {name: …}` if you want forced structured output. Don't reimplement provider plumbing.

## What we reject

- PRs that don't touch `DEV_NOTES.md` (aside from truly trivial typo fixes).
- PRs that loosen TypeScript strictness.
- Secrets committed to tracked files.
- `git add -A` where an `.env` or similar was untracked — we'll ask you to rewrite history.
- New dependencies added without a `Why` line somewhere. Bundle size matters on mobile; edge cold-start matters on Workers.
- Features that don't exist in `REQs.md` or `ROADMAP.md`, with no prior issue / design conversation.

## Questions

Open a GitHub issue. Tag it `question` or `discussion`.

## Code of conduct

Be kind, be direct. We're trying to ship software, not perform. Attacking people gets you banned; attacking ideas is encouraged.
