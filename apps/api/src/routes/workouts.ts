import { Hono } from "hono";
import type {
  CurrentWorkoutResponse,
  Exercise,
  GenerateWorkoutResponse,
  WorkoutPlan,
  WorkoutSession,
} from "@mai/shared";
import type { Env, Variables } from "../env.js";
import { requireAuth } from "../middleware/auth.js";
import { getProvider } from "../lib/ai/index.js";
import {
  createActivePlan,
  getActivePlan,
  getProfile,
  getRecentCompletedSessions,
} from "../lib/db.js";
import { buildPlanningSystemPrompt, SAVE_PLAN_TOOL } from "../prompts/planning.js";

export const workoutsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

workoutsRoutes.use("*", requireAuth);

workoutsRoutes.get("/current", async (c) => {
  const user = c.get("user");
  const plan = await getActivePlan(c.env.DB, user.id);
  const res: CurrentWorkoutResponse = { plan };
  return c.json(res);
});

workoutsRoutes.post("/generate", async (c) => {
  const user = c.get("user");

  const profile = await getProfile(c.env.DB, user.id);
  if (!profile) return c.json({ error: "profile_incomplete" }, 409);

  let provider;
  try {
    provider = getProvider(c.env, "planning");
  } catch (err) {
    return c.json(
      { error: "ai_not_configured", message: err instanceof Error ? err.message : "" },
      503,
    );
  }

  const recentSessions = await getRecentCompletedSessions(c.env.DB, user.id, 6);

  const result = await provider.chat({
    system: buildPlanningSystemPrompt(profile, recentSessions),
    messages: [
      {
        role: "user",
        content:
          recentSessions.length > 0
            ? "Generate next week's plan, progressing from last week's performance."
            : "Generate this week's plan.",
      },
    ],
    tools: [SAVE_PLAN_TOOL],
    toolChoice: { name: SAVE_PLAN_TOOL.name },
    temperature: 0.5,
    maxTokens: 4000,
  });

  const toolCall = result.toolCalls.find((tc) => tc.name === SAVE_PLAN_TOOL.name);
  if (!toolCall) {
    return c.json(
      {
        error: "planning_failed",
        message: "planner did not return a structured plan",
      },
      502,
    );
  }

  const plan = toolInputToPlan(toolCall.input);
  if (!plan) {
    return c.json({ error: "planning_invalid", message: "plan failed validation" }, 502);
  }

  const goal =
    profile.primaryGoals && profile.primaryGoals.length > 0
      ? profile.primaryGoals.join(", ")
      : null;

  const stored = await createActivePlan(c.env.DB, user.id, plan, goal);
  const res: GenerateWorkoutResponse = { plan: stored };
  return c.json(res);
});

function toolInputToPlan(input: Record<string, unknown>): WorkoutPlan | null {
  const name = typeof input.name === "string" ? input.name : null;
  const summary = typeof input.summary === "string" ? input.summary : null;
  const sessionsPerWeek =
    typeof input.sessions_per_week === "number"
      ? Math.round(input.sessions_per_week)
      : null;
  const durationWeeks =
    typeof input.duration_weeks === "number" ? Math.round(input.duration_weeks) : null;
  const rawTemplate = Array.isArray(input.weekly_template) ? input.weekly_template : null;
  if (!name || !summary || !sessionsPerWeek || !durationWeeks || !rawTemplate) return null;

  const weeklyTemplate: WorkoutSession[] = [];
  for (const raw of rawTemplate) {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    const title = typeof s.title === "string" ? s.title : null;
    const focus = typeof s.focus === "string" ? s.focus : null;
    const durationMinutes =
      typeof s.duration_minutes === "number" ? Math.round(s.duration_minutes) : null;
    const rawEx = Array.isArray(s.exercises) ? s.exercises : null;
    if (!title || !focus || !durationMinutes || !rawEx) return null;

    const exercises: Exercise[] = [];
    for (const e of rawEx) {
      if (!e || typeof e !== "object") return null;
      const ex = e as Record<string, unknown>;
      const exName = typeof ex.name === "string" ? ex.name : null;
      const sets = typeof ex.sets === "number" ? Math.round(ex.sets) : null;
      const reps = typeof ex.reps === "string" ? ex.reps : null;
      const restSeconds =
        typeof ex.rest_seconds === "number" ? Math.round(ex.rest_seconds) : null;
      if (!exName || sets === null || !reps || restSeconds === null) return null;
      const exercise: Exercise = {
        name: exName,
        sets,
        reps,
        restSeconds,
      };
      if (typeof ex.notes === "string" && ex.notes.trim()) exercise.notes = ex.notes.trim();
      exercises.push(exercise);
    }

    weeklyTemplate.push({ title, focus, durationMinutes, exercises });
  }

  return { name, summary, sessionsPerWeek, durationWeeks, weeklyTemplate };
}
