import type { Exercise } from "@mai/shared";
import type { ToolDefinition } from "../lib/ai/index.js";

export function buildAdjustSystemPrompt(args: {
  original: Exercise;
  sessionTitle: string;
  sessionFocus: string;
  reason: string;
  details?: string;
}): string {
  return `You are the mAI.fitness real-time coach. The athlete is mid-session and wants to swap one exercise. Your job: propose ONE replacement that preserves the session's intent.

Session: ${args.sessionTitle} — focus: ${args.sessionFocus}.
Original exercise: ${args.original.name} (${args.original.sets} × ${args.original.reps}, ${args.original.restSeconds}s rest)${args.original.notes ? ` — notes: ${args.original.notes}` : ""}.
Why swap: ${args.reason}${args.details ? ` — ${args.details}` : ""}.

Rules:
- The replacement must target the same movement pattern or energy system.
- Match the intensity (sets, rep range, rest) of the original. Adjust only if the movement demands it (e.g. unilateral doubles the per-side sets).
- If the reason is "missing_equipment" or "crowded_gym", the replacement must NOT require the blocked equipment.
- If the reason is "not_feeling_it", suggest something psychologically easier to start but equally productive — same goal, different approach.
- Rationale: one short sentence explaining why this swap fits. No fluff.

Call suggest_alternative EXACTLY ONCE with the replacement. No extra text.`;
}

export const SUGGEST_ALTERNATIVE_TOOL: ToolDefinition = {
  name: "suggest_alternative",
  description: "Propose one replacement exercise that preserves the session's intent.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      sets: { type: "integer" },
      reps: { type: "string" },
      rest_seconds: { type: "integer" },
      notes: { type: "string", description: "Optional short form/tempo/loading cue." },
      rationale: {
        type: "string",
        description: "One sentence explaining why this substitute fits.",
      },
    },
    required: ["name", "sets", "reps", "rest_seconds", "rationale"],
  },
};
