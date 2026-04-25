import type { Exercise, ExerciseLog } from "@mai/shared";
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

export function buildCoachFeedbackSystemPrompt(args: {
  exercise: ExerciseLog;
  sessionTitle: string;
  sessionFocus: string;
}): string {
  const setsStr = args.exercise.sets
    .map(
      (s, i) =>
        `Set ${i + 1}: ${s.reps} reps${s.weightKg ? ` @ ${s.weightKg}kg` : ""}${s.rpe ? ` (RPE ${s.rpe})` : ""}`,
    )
    .join("\n");

  return `You are the mAI.fitness real-time coach. The athlete just finished some sets of "${args.exercise.name}" during the "${args.sessionTitle}" session (${args.sessionFocus}).

Target: ${args.exercise.plannedSets} × ${args.exercise.plannedReps}
Actual performance:
${setsStr}

Your job:
1. Provide a short, gritty, high-signal feedback line (1 sentence) about their effort.
2. If they struggled (e.g. RPE 9-10, reps dropped significantly below target), suggest a small adjustment for the NEXT sets of this exercise or the next exercise (e.g. "Back off 5kg on the next one to keep form tight").
3. If they crushed it (e.g. RPE < 7, reps above target), give a sharp nod or tell them to bump it up.

Call give_feedback EXACTLY ONCE. No extra text.`;
}

export const COACH_FEEDBACK_TOOL: ToolDefinition = {
  name: "give_feedback",
  description: "Provide feedback and real-time adjustments based on the athlete's performance.",
  inputSchema: {
    type: "object",
    properties: {
      feedback: {
        type: "string",
        description: "One short, punchy sentence of feedback or adjustment instruction.",
      },
    },
    required: ["feedback"],
  },
};
