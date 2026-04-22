# AGENTS.md

How AI features are built in this codebase. Read this before adding a new one.

This is the design doc for the AI plumbing — complementary to [`CLAUDE.md`](./CLAUDE.md) (which is about how AI agents **work on** this repo) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) (which is the overall system map).

---

## Five rules

1. **No raw provider SDKs in route code.** Always go through `getProvider(env, role)`.
2. **No markdown/regex parsing of model outputs.** Use tool-use with `toolChoice: {name: …}` when you need structured data. Validate the tool-call `input` field-by-field server-side.
3. **System prompts live in `apps/api/src/prompts/`.** One file per feature, exporting the system prompt (or a builder function) and the tool definition(s). Route code composes; it does not own prompt text.
4. **Conversations are DB rows, not blobs.** The `messages` table stores `role | content | tool_calls | tool_call_id`. Rebuilding context for the next turn is `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at`.
5. **Models are env vars, not constants.** `AI_MODEL_CHAT`, `AI_MODEL_PLANNING`, `AI_MODEL_VISION`. Hardcoded IDs break when vendors retire aliases (they do).

---

## The provider abstraction

Located at [`apps/api/src/lib/ai/`](./apps/api/src/lib/ai/):

| File | Purpose |
|---|---|
| `types.ts` | `ChatMessageText`, `ChatRequest`, `ChatResult`, `ToolDefinition`, `ToolCall`, `JsonSchema`, `AiRole` — the vendor-neutral shapes. |
| `provider.ts` | `Provider` interface (`chat(req): Promise<ChatResult>`) + `ProviderError`. |
| `openai.ts` | OpenAI implementation. Translates our `ChatRequest` → chat completions API, `tool_calls` ↔ `toolCalls`. |
| `anthropic.ts` | Anthropic implementation. System prompt is top-level (not a message), tool results wrapped as `user` `tool_result` blocks. |
| `index.ts` | `getProvider(env, role)` — reads `AI_MODEL_<ROLE>` (format `<provider>/<model>`), falls back to TECH.md defaults, throws when the corresponding API key env var is missing. |

### Adding a new provider

1. New file in `apps/api/src/lib/ai/<name>.ts` implementing `Provider`.
2. Branch in `index.ts::getProvider` on `spec.provider === "<name>"`.
3. Document the env-var format in `SETUP.md`.

That's it. Every route that already calls `getProvider` picks up the new backend for free.

### Roles

Three roles today: `chat` (onboarding turn, in-session swaps), `planning` (plan generation), `vision` (reserved — equipment audit). The distinction is semantic, not technical — it's there so you can pick different models for different latency/cost/reasoning trade-offs via env.

---

## The "forced tool" pattern

Any time we need structured data, we define a tool and force it:

```ts
const result = await provider.chat({
  system: buildFooSystemPrompt(...),
  messages: [{ role: "user", content: "Do the thing." }],
  tools: [SAVE_FOO_TOOL],
  toolChoice: { name: SAVE_FOO_TOOL.name },  // MUST — not "auto"
  temperature: 0.5,
  maxTokens: 4000,
});

const call = result.toolCalls.find((tc) => tc.name === SAVE_FOO_TOOL.name);
if (!call) return c.json({ error: "failed", message: "no tool call" }, 502);

const parsed = parseToolInput(call.input);  // field-by-field validation
if (!parsed) return c.json({ error: "invalid", message: "schema mismatch" }, 502);
```

Why:
- The model literally cannot return prose. Whatever it "thinks" at us arrives as a JSON object shaped by our schema.
- The parser is our trust boundary. Missing or malformed fields → 502, not a silently-corrupt DB row.
- 502 (not 500) so the client can retry against a transient model issue without the caller assuming our code is broken.

Why not JSON mode:
- Works on some models, not all. `toolChoice` is the portable version of the same idea and is the shared contract we expose in our `Provider` interface.

### When NOT to force a tool

- Open-ended chat turns where the model should reply conversationally (e.g. onboarding's `/send` endpoint when the discovery isn't done yet). There we pass `toolChoice: "auto"` and let the model pick: either a text reply (the conversation continues) or a `save_profile` call (the conversation ends).

See `routes/chat.ts:65` for the `auto` branch and `routes/workouts.ts:40` for the forced branch.

---

## Prompts live in their own files

Location: [`apps/api/src/prompts/`](./apps/api/src/prompts/). One file per feature, same name as the route that uses it when practical:

- `onboarding.ts` → `routes/chat.ts`
- `planning.ts` → `routes/workouts.ts`
- `adjust.ts` → `routes/sessions.ts`

Each file exports:
- The system prompt (string or builder function).
- Any tool definitions.
- Optionally, a canned opener or constant.

**Builder functions vs constants:** when the prompt needs to interpolate user-specific data (the profile in planning, the exercise in adjust), export a builder: `buildPlanningSystemPrompt(profile, recentSessions)`. When the prompt is static (onboarding), export a string constant.

**Why files, not inline:** system prompts are the spec of how the AI behaves. You'll edit them more often than you edit the route code that invokes them. Putting them in separate files makes them grep-able, diff-reviewable, and reusable (e.g. a testing harness can import the builder without spinning up the route).

---

## Persistence pattern: messages as DB rows

`conversations` + `messages` tables (migration `0002_onboarding.sql`).

Every assistant turn — including tool calls — gets a row:
- `role='assistant'`, `content='<text part or empty>'`, `tool_calls='<JSON array>'` when the model called tools.
- Subsequent tool-result turns: `role='tool'`, `content='<tool result>'`, `tool_call_id='<id from original call>'`.

On the next turn we `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC` and feed the whole conversation back to the provider (`listRawMessages` in `lib/db.ts`). The provider adapter handles vendor-specific translation.

**Do not** store a serialised "chat history" blob on the conversation row. Rows are easier to audit, redact, and query.

---

## Pattern: "dynamic context via SELECT, not duplicate tables"

Planning regeneration reads session logs to decide progressions:

```ts
const recentSessions = await getRecentCompletedSessions(c.env.DB, user.id, 6);
const result = await provider.chat({
  system: buildPlanningSystemPrompt(profile, recentSessions),
  ...
});
```

No `progressions` table, no `load_targets` table. The history IS the derived signal. If later we need to surface "Week 3 of block: +5% load on squats" we compute it from logs, not from a precomputed cache. Simpler invalidation, honest to the source of truth.

If a derived signal becomes expensive to recompute every request, that's a caching decision, not a data-model decision — cache with a TTL, don't invent a new table.

---

## Feature-add checklist

Copy this into a PR description if you're adding a new AI feature.

- [ ] New prompt file at `apps/api/src/prompts/<feature>.ts`.
- [ ] Tool definition(s) colocated with the prompt if the feature needs structured output.
- [ ] Server-side parser that validates every required field of the tool input. Returns `null` on any mismatch; route returns 502.
- [ ] Route uses `getProvider(env, role)`; explicit `toolChoice` either `{name: …}` or `"auto"` (never omitted).
- [ ] Response always returns 503 `ai_not_configured` (not 500) when `getProvider` throws due to missing API key. See `routes/workouts.ts:28-34`.
- [ ] No new env vars for model IDs unless you're introducing a new role. Reuse `AI_MODEL_CHAT`/`PLANNING`/`VISION`.
- [ ] Shared types for request/response added to `packages/shared`, exported from `index.ts`, and listed in the `exports` map in `packages/shared/package.json`.
- [ ] Migration file if you're persisting anything.
- [ ] Entry in `ARCHITECTURE.md` routes table; entry in `DEV_NOTES.md`.
- [ ] Smoke-tested locally with at least the 401/403/404/503 and happy paths.

---

## Anti-patterns to avoid

- **Dumping all model logic into a route file.** Prompts → `prompts/`, DB → `db.ts`, routes stay thin. If your route is >200 lines, something leaked.
- **Parsing markdown tables / regex-extracting JSON from a model's prose.** We force tools for a reason.
- **`max_tokens` defaulted to a value that truncates typical output.** Plan generation at 1024 tokens silently cuts weeks 2+. Err high (4000 for planning; 500 for chat/adjust).
- **Storing model outputs without the prompt version.** If we ever need to A/B prompts, we need to know which prompt produced which row. Consider a `prompt_version` column when you introduce a new prompt. (Not done yet — see `ROADMAP.md`.)
- **Silent fallbacks to a different model.** If `claude-sonnet-4-6` 404s, 502 out — don't silently use Haiku. Model choice has product implications.
