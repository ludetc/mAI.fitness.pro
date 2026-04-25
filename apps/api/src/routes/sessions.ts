import { Hono } from "hono";
import type {
  AdjustSessionRequest,
  AdjustSessionResponse,
  CompleteSessionResponse,
  Exercise,
  ExerciseLog,
  GetSessionResponse,
  SessionEnvelope,
  SessionLog,
  StartSessionRequest,
  StartSessionResponse,
  StoredWorkoutPlan,
  UpdateSessionRequest,
  UpdateSessionResponse,
  WorkoutSession,
} from "@mai/shared";
import type { Env, Variables } from "../env.js";
import { requireAuth } from "../middleware/auth.js";
import { getProvider } from "../lib/ai/index.js";
import {
  completeSessionLog,
  createSessionLog,
  getActiveSessionLog,
  getPlanById,
  getRecentCompletedSessions,
  getSessionLog,
  updateSessionLogExercises,
} from "../lib/db.js";
import {
  buildAdjustSystemPrompt,
  buildCoachFeedbackSystemPrompt,
  COACH_FEEDBACK_TOOL,
  SUGGEST_ALTERNATIVE_TOOL,
} from "../prompts/adjust.js";

export const sessionsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

sessionsRoutes.use("*", requireAuth);

sessionsRoutes.post("/start", async (c) => {
  const user = c.get("user");
  let body: StartSessionRequest;
  try {
    body = await c.req.json<StartSessionRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (typeof body.planId !== "string" || typeof body.sessionIndex !== "number") {
    return c.json({ error: "missing_fields" }, 400);
  }

  const plan = await getPlanById(c.env.DB, user.id, body.planId);
  if (!plan) return c.json({ error: "plan_not_found" }, 404);
  const plannedSession = plan.plan.weeklyTemplate[body.sessionIndex];
  if (!plannedSession) return c.json({ error: "session_index_out_of_range" }, 404);

  // If there's an active session already, return it (idempotent behavior for the same user).
  const active = await getActiveSessionLog(c.env.DB, user.id);
  if (active) {
    const res = await hydrateEnvelope(c.env.DB, user.id, active);
    if (!res) return c.json({ error: "plan_not_found" }, 404);
    return c.json<StartSessionResponse>(res);
  }

  const exercises: ExerciseLog[] = plannedSession.exercises.map((e) => ({
    name: e.name,
    plannedSets: e.sets,
    plannedReps: e.reps,
    plannedRestSeconds: e.restSeconds,
    sets: [],
    ...(e.notes ? { notes: e.notes } : {}),
  }));

  const session = await createSessionLog(c.env.DB, {
    userId: user.id,
    planId: plan.id,
    sessionIndex: body.sessionIndex,
    sessionTitle: plannedSession.title,
    exercises,
  });

  return c.json<StartSessionResponse>({ session, plannedSession });
});

sessionsRoutes.get("/recent", async (c) => {
  const user = c.get("user");
  const raw = c.req.query("limit");
  const limit = raw ? Number(raw) : 10;
  const safe = Number.isFinite(limit) && limit > 0 ? limit : 10;
  const sessions = await getRecentCompletedSessions(c.env.DB, user.id, safe);
  return c.json({ sessions });
});

sessionsRoutes.get("/active", async (c) => {
  const user = c.get("user");
  const active = await getActiveSessionLog(c.env.DB, user.id);
  if (!active) return c.json({ session: null });
  const envelope = await hydrateEnvelope(c.env.DB, user.id, active);
  if (!envelope) return c.json({ session: null });
  return c.json(envelope);
});

sessionsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const session = await getSessionLog(c.env.DB, user.id, id);
  if (!session) return c.json({ error: "not_found" }, 404);
  const envelope = await hydrateEnvelope(c.env.DB, user.id, session);
  if (!envelope) return c.json({ error: "plan_not_found" }, 404);
  return c.json<GetSessionResponse>(envelope);
});

sessionsRoutes.put("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  let body: UpdateSessionRequest;
  try {
    body = await c.req.json<UpdateSessionRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!Array.isArray(body.exercises)) return c.json({ error: "missing_exercises" }, 400);

  const existing = await getSessionLog(c.env.DB, user.id, id);
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.completedAt) return c.json({ error: "already_completed" }, 409);

  const envelope = await hydrateEnvelope(c.env.DB, user.id, existing);
  if (!envelope) return c.json({ error: "plan_not_found" }, 404);

  const notes = typeof body.notes === "string" ? body.notes : null;

  // Real-time adaptation: if we're logging a new set, we might want to generate feedback.
  // We compare body.exercises with existing.exercises to see if a set was added.
  const updatedExercises = [...body.exercises];

  for (let i = 0; i < updatedExercises.length; i++) {
    const newEx = updatedExercises[i];
    const oldEx = existing.exercises[i];
    if (newEx && oldEx && newEx.sets.length > oldEx.sets.length && !newEx.coachFeedback) {
      // New set logged for this exercise!
      let provider;
      try {
        provider = getProvider(c.env, "chat");
        const result = await provider.chat({
          system: buildCoachFeedbackSystemPrompt({
            exercise: newEx,
            sessionTitle: existing.sessionTitle,
            sessionFocus: envelope.plannedSession.focus,
          }),
          messages: [{ role: "user", content: "Give me feedback on these sets." }],
          tools: [COACH_FEEDBACK_TOOL],
          toolChoice: { name: COACH_FEEDBACK_TOOL.name },
          temperature: 0.7,
          maxTokens: 200,
        });
        const call = result.toolCalls.find((tc) => tc.name === COACH_FEEDBACK_TOOL.name);
        if (call && typeof call.input.feedback === "string") {
          newEx.coachFeedback = call.input.feedback;
        }
      } catch {
        // AI feedback is non-critical, skip if it fails.
      }
      break; // Only generate feedback for one exercise at a time to keep it snappy.
    }
  }

  await updateSessionLogExercises(c.env.DB, user.id, id, updatedExercises, notes);

  const finalUpdated = await getSessionLog(c.env.DB, user.id, id);
  if (!finalUpdated) return c.json({ error: "not_found" }, 404);
  const finalEnvelope = await hydrateEnvelope(c.env.DB, user.id, finalUpdated);
  if (!finalEnvelope) return c.json({ error: "plan_not_found" }, 404);
  return c.json<UpdateSessionResponse>(finalEnvelope);
});

sessionsRoutes.post("/:id/complete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await getSessionLog(c.env.DB, user.id, id);
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.completedAt) return c.json({ error: "already_completed" }, 409);
  await completeSessionLog(c.env.DB, user.id, id);
  const updated = await getSessionLog(c.env.DB, user.id, id);
  if (!updated) return c.json({ error: "not_found" }, 404);
  const envelope = await hydrateEnvelope(c.env.DB, user.id, updated);
  if (!envelope) return c.json({ error: "plan_not_found" }, 404);
  return c.json<CompleteSessionResponse>(envelope);
});

sessionsRoutes.post("/:id/adjust", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  let body: AdjustSessionRequest;
  try {
    body = await c.req.json<AdjustSessionRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (typeof body.exerciseIndex !== "number") {
    return c.json({ error: "missing_exercise_index" }, 400);
  }
  const reason = body.reason;
  if (
    reason !== "missing_equipment" &&
    reason !== "crowded_gym" &&
    reason !== "not_feeling_it" &&
    reason !== "other"
  ) {
    return c.json({ error: "invalid_reason" }, 400);
  }

  const session = await getSessionLog(c.env.DB, user.id, id);
  if (!session) return c.json({ error: "not_found" }, 404);
  const plan = await getPlanById(c.env.DB, user.id, session.planId);
  if (!plan) return c.json({ error: "plan_not_found" }, 404);
  const plannedSession = plan.plan.weeklyTemplate[session.sessionIndex];
  if (!plannedSession) return c.json({ error: "plan_session_missing" }, 404);
  const original = plannedSession.exercises[body.exerciseIndex];
  if (!original) return c.json({ error: "exercise_index_out_of_range" }, 404);

  let provider;
  try {
    provider = getProvider(c.env, "chat");
  } catch (err) {
    return c.json(
      { error: "ai_not_configured", message: err instanceof Error ? err.message : "" },
      503,
    );
  }

  const result = await provider.chat({
    system: buildAdjustSystemPrompt({
      original,
      sessionTitle: plannedSession.title,
      sessionFocus: plannedSession.focus,
      reason: humanReason(reason),
      details: body.details,
    }),
    messages: [{ role: "user", content: "Suggest a replacement." }],
    tools: [SUGGEST_ALTERNATIVE_TOOL],
    toolChoice: { name: SUGGEST_ALTERNATIVE_TOOL.name },
    temperature: 0.6,
    maxTokens: 500,
  });

  const call = result.toolCalls.find((tc) => tc.name === SUGGEST_ALTERNATIVE_TOOL.name);
  if (!call) return c.json({ error: "adjust_failed" }, 502);

  const parsed = parseAdjustCall(call.input);
  if (!parsed) return c.json({ error: "adjust_invalid" }, 502);

  return c.json<AdjustSessionResponse>(parsed);
});

async function hydrateEnvelope(
  db: D1Database,
  userId: string,
  session: SessionLog,
): Promise<SessionEnvelope | null> {
  const plan: StoredWorkoutPlan | null = await getPlanById(db, userId, session.planId);
  if (!plan) return null;
  const plannedSession: WorkoutSession | undefined =
    plan.plan.weeklyTemplate[session.sessionIndex];
  if (!plannedSession) return null;
  return { session, plannedSession };
}

function humanReason(r: AdjustSessionRequest["reason"]): string {
  switch (r) {
    case "missing_equipment":
      return "the equipment they need is not available";
    case "crowded_gym":
      return "the gym is too crowded and the needed machine is in use";
    case "not_feeling_it":
      return "they're not feeling up to this specific movement today";
    case "other":
      return "another reason (see details)";
  }
}

function parseAdjustCall(
  input: Record<string, unknown>,
): AdjustSessionResponse | null {
  const name = typeof input.name === "string" ? input.name : null;
  const sets = typeof input.sets === "number" ? Math.round(input.sets) : null;
  const reps = typeof input.reps === "string" ? input.reps : null;
  const restSeconds =
    typeof input.rest_seconds === "number" ? Math.round(input.rest_seconds) : null;
  const rationale = typeof input.rationale === "string" ? input.rationale : null;
  if (!name || sets === null || !reps || restSeconds === null || !rationale) return null;

  const suggestion: Exercise = { name, sets, reps, restSeconds };
  if (typeof input.notes === "string" && input.notes.trim()) {
    suggestion.notes = input.notes.trim();
  }
  return { suggestion, rationale };
}
