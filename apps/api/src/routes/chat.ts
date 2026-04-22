import { Hono } from "hono";
import type {
  OnboardingHistoryResponse,
  OnboardingSendRequest,
  OnboardingSendResponse,
  OnboardingStartResponse,
  Profile,
} from "@mai/shared";
import type { Env, Variables } from "../env.js";
import { requireAuth } from "../middleware/auth.js";
import { getProvider } from "../lib/ai/index.js";
import {
  addMessage,
  createConversation,
  getConversation,
  getLatestConversationByKind,
  getProfile,
  listPublicMessages,
  listRawMessages,
  markConversationComplete,
  upsertProfile,
} from "../lib/db.js";
import {
  ONBOARDING_OPENER,
  ONBOARDING_SYSTEM_PROMPT,
  SAVE_PROFILE_TOOL,
} from "../prompts/onboarding.js";

export const chatRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

chatRoutes.use("*", requireAuth);

chatRoutes.post("/onboarding/start", async (c) => {
  const user = c.get("user");

  const existing = await getLatestConversationByKind(c.env.DB, user.id, "onboarding");
  if (existing) {
    const messages = await listPublicMessages(c.env.DB, existing.id);
    const res: OnboardingStartResponse = { conversation: existing, messages };
    return c.json(res);
  }

  const conversation = await createConversation(c.env.DB, user.id, "onboarding");
  const opener = await addMessage(c.env.DB, conversation.id, {
    role: "assistant",
    content: ONBOARDING_OPENER,
  });
  const res: OnboardingStartResponse = { conversation, messages: [opener] };
  return c.json(res);
});

chatRoutes.post("/onboarding/:id/send", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");

  const conversation = await getConversation(c.env.DB, conversationId, user.id);
  if (!conversation) return c.json({ error: "not_found" }, 404);
  if (conversation.completedAt) return c.json({ error: "conversation_completed" }, 409);

  let body: OnboardingSendRequest;
  try {
    body = await c.req.json<OnboardingSendRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const trimmed = typeof body.message === "string" ? body.message.trim() : "";
  if (!trimmed) return c.json({ error: "empty_message" }, 400);

  let provider;
  try {
    provider = getProvider(c.env, "chat");
  } catch (err) {
    return c.json(
      { error: "ai_not_configured", message: err instanceof Error ? err.message : "" },
      503,
    );
  }

  const userMsg = await addMessage(c.env.DB, conversationId, {
    role: "user",
    content: trimmed,
  });

  const rawMessages = await listRawMessages(c.env.DB, conversationId);

  const result = await provider.chat({
    system: ONBOARDING_SYSTEM_PROMPT,
    messages: rawMessages,
    tools: [SAVE_PROFILE_TOOL],
    toolChoice: "auto",
    temperature: 0.8,
    maxTokens: 500,
  });

  const newMessages = [userMsg];

  const saveCall = result.toolCalls.find((tc) => tc.name === SAVE_PROFILE_TOOL.name);
  if (saveCall) {
    const profile = toolInputToProfile(saveCall.input);
    await upsertProfile(c.env.DB, user.id, profile);
    // Persist the assistant's tool-call turn verbatim (empty text + tool_calls).
    await addMessage(c.env.DB, conversationId, {
      role: "assistant",
      content: result.text ?? "",
      toolCalls: result.toolCalls,
    });
    const wrapUp =
      typeof saveCall.input.wrap_up_message === "string" && saveCall.input.wrap_up_message
        ? saveCall.input.wrap_up_message
        : "All set. Let's go to work.";
    const finalMsg = await addMessage(c.env.DB, conversationId, {
      role: "assistant",
      content: wrapUp,
    });
    await markConversationComplete(c.env.DB, conversationId);
    newMessages.push(finalMsg);
    const res: OnboardingSendResponse = {
      messages: newMessages,
      completed: true,
      profile,
    };
    return c.json(res);
  }

  const assistantText = result.text || "(silent)";
  const assistantMsg = await addMessage(c.env.DB, conversationId, {
    role: "assistant",
    content: assistantText,
  });
  newMessages.push(assistantMsg);

  const res: OnboardingSendResponse = {
    messages: newMessages,
    completed: false,
    profile: null,
  };
  return c.json(res);
});

chatRoutes.get("/onboarding/:id", async (c) => {
  const user = c.get("user");
  const conversationId = c.req.param("id");

  const conversation = await getConversation(c.env.DB, conversationId, user.id);
  if (!conversation) return c.json({ error: "not_found" }, 404);

  const messages = await listPublicMessages(c.env.DB, conversationId);
  const profile = conversation.completedAt ? await getProfile(c.env.DB, user.id) : null;

  const res: OnboardingHistoryResponse = { conversation, messages, profile };
  return c.json(res);
});

function toolInputToProfile(input: Record<string, unknown>): Profile {
  const profile: Profile = {};
  if (typeof input.age === "number") profile.age = Math.round(input.age);
  if (
    typeof input.sex === "string" &&
    ["male", "female", "other", "prefer_not_to_say"].includes(input.sex)
  ) {
    profile.sex = input.sex as Profile["sex"];
  }
  if (typeof input.height_cm === "number") profile.heightCm = input.height_cm;
  if (typeof input.weight_kg === "number") profile.weightKg = input.weight_kg;
  if (Array.isArray(input.primary_goals))
    profile.primaryGoals = input.primary_goals.filter((g): g is string => typeof g === "string");
  if (typeof input.sessions_per_week === "number")
    profile.sessionsPerWeek = Math.round(input.sessions_per_week);
  if (typeof input.minutes_per_session === "number")
    profile.minutesPerSession = Math.round(input.minutes_per_session);
  if (
    typeof input.environment === "string" &&
    ["home", "commercial_gym", "outdoor", "hybrid"].includes(input.environment)
  ) {
    profile.environment = input.environment as Profile["environment"];
  }
  if (typeof input.current_activity === "string") profile.currentActivity = input.current_activity;
  if (typeof input.health_notes === "string") profile.healthNotes = input.health_notes;
  if (typeof input.occupation === "string") profile.occupation = input.occupation;
  if (Array.isArray(input.hobbies))
    profile.hobbies = input.hobbies.filter((h): h is string => typeof h === "string");
  if (typeof input.personality_notes === "string")
    profile.personalityNotes = input.personality_notes;
  return profile;
}
