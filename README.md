# mAI.fitness.pro

**AI-first fitness companion.** Build a deep personal profile through a conversation, get a weekly plan written around your actual life, do the work in-app with real-time tracking and on-the-fly exercise swaps. Every regenerated plan is a function of what you actually did last week, not a guess.

![stack](https://img.shields.io/badge/Expo-54-000?logo=expo) ![](https://img.shields.io/badge/Cloudflare_Workers-D1-F38020?logo=cloudflare) ![](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript) ![](https://img.shields.io/badge/Anthropic-Claude_Sonnet_4.6-CC785C)

> **Status:** Pass 6 — onboarding, plan generation, session execution, rest timer, summary, dynamic tailoring all working end-to-end. Deployed Worker live at `https://mai-fitness-api.apexdiligence.workers.dev`. Mobile app runs in Expo Go; Google OAuth client setup is the last thing before a real user can sign in.

---

## What it does

- **Conversational onboarding** — the AI interviews you across six discovery areas (demographics, goals, availability, current activity, health/safety, holistic personality) and saves a structured profile via tool-use. No forms.
- **Plan generation** — Claude Sonnet 4.6 writes one week of sessions tuned to your profile, equipment, time, and health constraints. Regenerate anytime.
- **Real-time session execution** — log reps/weight/RPE per set with haptic feedback, rest timer auto-starts at the prescribed rest, swap any exercise mid-session (missing equipment / busy machine / not feeling it) with an AI-suggested alternative.
- **Post-session summary** — sets logged, total volume, swaps, skips, elapsed time.
- **Dynamic tailoring** — next week's plan reads your last six completed sessions, progresses load where you hit targets, holds or reduces where you missed, replaces consistently-skipped movements.

See [`REQs.md`](./REQs.md) for the full product spec.

## Architecture (30 seconds)

Two runtime targets, three workspaces, typed contracts between them.

```
apps/mobile (Expo + Router)  ─── HTTPS + Bearer JWT ───▶  apps/api (Cloudflare Workers + Hono + D1)
         ▲                                                           │
         │  Google OAuth id_token                                     ▼
         └── Google Identity                                    Cloudflare D1 (SQLite @ edge)
                                                                     │
                                                                     ▼
                                                              Anthropic Claude
                                                              (tool-use structured output)
```

- **`apps/mobile`** — Expo 54, Expo Router, TypeScript.
- **`apps/api`** — Cloudflare Workers, Hono, D1, TypeScript.
- **`packages/shared`** — typed API contracts consumed by both sides (no build step, source-only).

Full details: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## AI design

- **Pluggable provider interface** ([`apps/api/src/lib/ai/`](./apps/api/src/lib/ai/)) — OpenAI and Anthropic implementations behind a single `Provider` contract. Swap models via env vars (`AI_MODEL_CHAT`, `AI_MODEL_PLANNING`, `AI_MODEL_VISION`) without touching code.
- **Tool-forced structured output** — profile extraction, plan generation, and exercise swaps all use `tool_choice = {name: …}` so the model must emit JSON that matches our schema. No regex-parsing markdown.
- **Message-level persistence** — conversations are stored as real DB rows with `role`, `content`, `tool_calls`, `tool_call_id`, so rebuilding context for the next turn is a single SELECT. See `apps/api/src/prompts/` for system prompts.
- **Tailoring without a separate "progressions" table** — the planner re-reads `session_logs` and derives progression live. Logs stay the source of truth.

The full set of patterns is in [`AGENTS.md`](./AGENTS.md).

## Quick start

```bash
git clone https://github.com/ludetc/mAI.fitness.pro.git
cd mAI.fitness.pro
npm install
```

Then follow [`SETUP.md`](./SETUP.md) for Google Cloud Console setup, env vars, and running both dev servers. First-time setup is ~30 minutes (most of it is GCP).

**Running against the deployed Worker?** Point the mobile `.env` at `https://mai-fitness-api.apexdiligence.workers.dev` and the Worker dev step is unnecessary — but Google OAuth setup is still required before sign-in works.

## Project conventions

This repo is designed to stay coherent across many AI-assisted edits. Before contributing, read:

- [`CLAUDE.md`](./CLAUDE.md) — standing obligations for any AI agent (dev notes before every commit, architecture doc kept current). Applies to humans too.
- [`AGENTS.md`](./AGENTS.md) — how to add a new AI-powered feature cleanly (provider, prompt, tool, route).
- [`DEV_NOTES.md`](./DEV_NOTES.md) — reverse-chronological dev log; every commit has an entry.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — workflow, code style, PR process.

## Roadmap & known gaps

[`ROADMAP.md`](./ROADMAP.md) tracks identified weaknesses (testing, rate-limiting, observability) and unfinished REQs phases (equipment photo audit, engagement notifications, deeper design polish). Issues and PRs welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[MIT](./LICENSE).
