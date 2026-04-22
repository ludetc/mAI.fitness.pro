import type { Profile, SessionLog } from "@mai/shared";
import type { ToolDefinition } from "../lib/ai/index.js";

export function buildPlanningSystemPrompt(
  profile: Profile,
  recentSessions: SessionLog[] = [],
): string {
  const historyBlock = recentSessions.length > 0
    ? `

Last week's actual performance — treat this as ground truth, not the plan on paper:
${formatHistory(recentSessions)}

Use this history to make a specific progression decision:
- If the athlete consistently hit or exceeded the prescribed sets/reps/weight, progress: bump load ~5-10% OR add a set where time allows. Name the progression in \`summary\`.
- If they consistently missed prescribed sets/reps, hold or reduce — back off one load-step. Do not keep stacking volume on a missed baseline.
- If they swapped specific exercises, consider whether the substitute is a better fit going forward (use the substitute in the new plan) or whether to re-try the original.
- If they skipped exercises, assume the issue is valid (time, energy, dislike). Either drop the movement, cut sets, or replace with something they'll actually do.
- If they showed high RPE (8+) on most sets at the prescribed load, don't progress yet — lock in the weight and tighten form.

Acknowledge the progression logic concisely in \`summary\` (one phrase, e.g. "week 2 — load bumped on squats, volume held elsewhere"). Don't lecture the athlete about why.`
    : "";

  return `You are the mAI.fitness head coach. You write training plans that actually get followed: honest about time, realistic about recovery, specific enough to execute without asking back.

This is the athlete's profile — treat every field as a hard constraint, not a suggestion:
${formatProfile(profile)}${historyBlock}

Your job: generate ONE week's worth of sessions that can be repeated for the horizon of the plan, with the expectation that future weeks get regenerated based on performance.

Rules:
- Respect ${profile.sessionsPerWeek ?? "the stated"} sessions/week and ${profile.minutesPerSession ?? "the stated"}-minute limit per session. Missing availability? Default to 3 sessions × 45 min.
- Anchor every session to a concrete focus drawn from the primary goals. No "general fitness" filler.
- Assume only the equipment implied by their environment (${profile.environment ?? "unstated"}). If unclear, lean toward bodyweight + single pair of dumbbells + resistance band. Don't invent equipment.
- Respect health notes: ${profile.healthNotes ? `"${profile.healthNotes}"` : "none stated"}. Contraindicated exercises are OFF the table — substitute, don't compromise.
- Keep exercise names canonical (e.g. "back squat", "Romanian deadlift", "push-up"). No made-up movements.
- Sets/reps/rest: be specific. Ranges are fine ("8-10 reps", "60-90s rest"). Always include rest in seconds.
- Notes per exercise: 1 short line, optional — form cue, tempo, or load guidance. Skip if nothing useful to say.
- The plan's \`name\` should reference the goal, not generic ("Ski Prep - Week 1/8" not "My Workout Plan").
- The \`summary\` is 1-2 sentences — what this week does for them and why.

Call \`save_plan\` EXACTLY ONCE with a complete plan. Do not return any other text.`;
}

function formatProfile(p: Profile): string {
  const lines: string[] = [];
  if (p.age !== undefined) lines.push(`- Age: ${p.age}`);
  if (p.sex) lines.push(`- Sex: ${p.sex}`);
  if (p.heightCm !== undefined) lines.push(`- Height: ${p.heightCm} cm`);
  if (p.weightKg !== undefined) lines.push(`- Weight: ${p.weightKg} kg`);
  if (p.primaryGoals && p.primaryGoals.length > 0)
    lines.push(`- Primary goals: ${p.primaryGoals.join(", ")}`);
  if (p.sessionsPerWeek !== undefined)
    lines.push(`- Sessions per week: ${p.sessionsPerWeek}`);
  if (p.minutesPerSession !== undefined)
    lines.push(`- Minutes per session: ${p.minutesPerSession}`);
  if (p.environment) lines.push(`- Environment: ${p.environment}`);
  if (p.currentActivity) lines.push(`- Current activity: ${p.currentActivity}`);
  if (p.healthNotes) lines.push(`- Health notes: ${p.healthNotes}`);
  if (p.occupation) lines.push(`- Occupation: ${p.occupation}`);
  if (p.hobbies && p.hobbies.length > 0) lines.push(`- Hobbies: ${p.hobbies.join(", ")}`);
  if (p.personalityNotes) lines.push(`- Personality: ${p.personalityNotes}`);
  return lines.length > 0 ? lines.join("\n") : "(profile missing)";
}

function formatHistory(sessions: SessionLog[]): string {
  const now = Date.now();
  return sessions
    .map((s) => {
      const completedAt = s.completedAt ?? s.startedAt;
      const daysAgo = Math.max(0, Math.round((now - completedAt) / 86_400_000));
      const header = `Session "${s.sessionTitle}" — ${daysAgo === 0 ? "today" : `${daysAgo}d ago`}`;
      const body = s.exercises
        .map((e) => {
          if (e.skipped) return `  - ${e.name}: SKIPPED`;
          const achieved = e.sets.length;
          const planned = e.plannedSets;
          const reps = e.sets.map((set) => set.reps);
          const weights = e.sets
            .map((set) => set.weightKg)
            .filter((w): w is number => typeof w === "number" && w > 0);
          const rpes = e.sets
            .map((set) => set.rpe)
            .filter((r): r is number => typeof r === "number");
          const bits: string[] = [`${achieved}/${planned} sets`];
          if (reps.length > 0) {
            const minR = Math.min(...reps);
            const maxR = Math.max(...reps);
            bits.push(minR === maxR ? `${minR} reps` : `${minR}-${maxR} reps`);
          }
          if (weights.length > 0) {
            const avg = Math.round(weights.reduce((a, b) => a + b, 0) / weights.length);
            bits.push(`avg ${avg} kg`);
          }
          if (rpes.length > 0) {
            const avgRpe = Math.round(rpes.reduce((a, b) => a + b, 0) / rpes.length);
            bits.push(`RPE ${avgRpe}`);
          }
          const swapped = e.substitutedFor ? ` (swapped from "${e.substitutedFor}")` : "";
          return `  - ${e.name}${swapped}: ${bits.join(", ")}`;
        })
        .join("\n");
      return `${header}\n${body}`;
    })
    .join("\n\n");
}

export const SAVE_PLAN_TOOL: ToolDefinition = {
  name: "save_plan",
  description:
    "Persist the generated weekly training plan. Call exactly once with the full plan.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Short plan name referencing the athlete's goal and horizon.",
      },
      summary: {
        type: "string",
        description:
          "1-2 sentences describing what this week's training does and why. If prior performance exists, name the progression decision (e.g. 'load bumped on squats, volume held').",
      },
      sessions_per_week: {
        type: "integer",
        description: "Number of sessions in the weekly template.",
      },
      duration_weeks: {
        type: "integer",
        description: "Number of weeks this plan is intended to run before regeneration.",
      },
      weekly_template: {
        type: "array",
        description:
          "One entry per session in the week. Length must equal sessions_per_week.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Session name, e.g. 'Lower body power'." },
            focus: {
              type: "string",
              description: "Concrete focus linking this session to a goal.",
            },
            duration_minutes: {
              type: "integer",
              description: "Planned session length in minutes.",
            },
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  sets: { type: "integer" },
                  reps: {
                    type: "string",
                    description: "Rep prescription, e.g. '8-10' or '30s'.",
                  },
                  rest_seconds: { type: "integer" },
                  notes: {
                    type: "string",
                    description:
                      "Optional short cue. Omit entirely if there is nothing useful to add.",
                  },
                },
                required: ["name", "sets", "reps", "rest_seconds"],
              },
            },
          },
          required: ["title", "focus", "duration_minutes", "exercises"],
        },
      },
    },
    required: ["name", "summary", "sessions_per_week", "duration_weeks", "weekly_template"],
  },
};
