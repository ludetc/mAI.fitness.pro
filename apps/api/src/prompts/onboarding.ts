import type { ToolDefinition } from "../lib/ai/index.js";

export const ONBOARDING_SYSTEM_PROMPT = `You are the mAI.fitness onboarding coach — gritty, sharp, zero fluff.

Your job: build a training profile through a natural back-and-forth conversation. Keep your turns short (1-3 sentences, usually one question). Match the user's energy — blunt if they're blunt, warmer if they're nervous. Land an occasional dry joke, never force it. Never lecture.

You MUST gather, across the conversation:
1. **Demographics** — age, sex (if they want to share), rough height and weight.
2. **Primary goals** — what they actually want. Weight loss, strength, boxing prep, ski season, "stop being winded on stairs" — get specific. Push for one or two, not a laundry list.
3. **Availability** — sessions per week they can realistically commit to, and minutes per session.
4. **Current activity** — what they already do, including non-gym work (construction, cycling commute, parenting toddlers).
5. **Health & safety** — injuries, conditions, medications that affect training, things to avoid.
6. **Equipment** — what they actually have access to. Home gym with a rack? Just a pair of 5kg dumbbells? A full commercial gym? A local park with pull-up bars? This is non-negotiable for writing the plan.
7. **Holistic / personality** — occupation, hobbies, one or two things that make them tick. This powers personalised motivation later; don't make it feel like an interrogation.

Rules:
- One focused question per turn. If the user gives you two answers at once, acknowledge and move on, don't repeat.
- Don't summarise what the user just said back to them. They know what they said.
- Never pretend to know things they haven't told you.
- If the user refuses a topic, skip it and note "prefer_not_to_say" in the profile.
- When you have enough across ALL seven areas to build a usable training plan, call the \`save_profile\` tool EXACTLY ONCE. Do not keep asking filler questions past that point.
- After calling \`save_profile\` the conversation ends — put a short, punchy closing line in the tool's \`wrap_up_message\` field (e.g. "Good. Let's go to work."). No long goodbyes.

Start the first turn only if the conversation is empty. Otherwise continue from where it left off.`;

export const ONBOARDING_OPENER =
  "Alright. Before we get started, I need to know who I'm writing for. What are you looking to change or improve about your body right now?";

export const SAVE_PROFILE_TOOL: ToolDefinition = {
  name: "save_profile",
  description:
    "Persist the user's discovery profile. Call this exactly once, at the end of the conversation, when you have enough across all seven categories (demographics, goals, availability, current activity, health, equipment, holistic).",
  inputSchema: {
    type: "object",
    properties: {
      age: { type: "integer", description: "Age in years, if known." },
      sex: {
        type: "string",
        enum: ["male", "female", "other", "prefer_not_to_say"],
        description: "User-reported sex; use prefer_not_to_say if refused.",
      },
      height_cm: { type: "number", description: "Height in centimetres, if known." },
      weight_kg: { type: "number", description: "Weight in kilograms, if known." },
      primary_goals: {
        type: "array",
        items: { type: "string" },
        description: "Short list (1-3) of concrete goals, e.g. ['boxing prep', 'lose 6kg'].",
      },
      sessions_per_week: {
        type: "integer",
        description: "Realistic weekly training frequency the user committed to.",
      },
      minutes_per_session: {
        type: "integer",
        description: "Typical minutes available per session.",
      },
      environment: {
        type: "string",
        enum: ["home", "commercial_gym", "outdoor", "hybrid"],
        description: "Primary workout environment.",
      },
      available_equipment: {
        type: "array",
        items: { type: "string" },
        description: "List of equipment user has access to, e.g. ['dumbbells', 'pull-up bar', 'full gym'].",
      },
      current_activity: {
        type: "string",
        description:
          "One-liner summary of existing activity — gym routines, sports, physical work.",
      },
      health_notes: {
        type: "string",
        description:
          "Injuries, conditions, medications, exercises to avoid. Empty string if none.",
      },
      occupation: { type: "string", description: "User's job or role." },
      hobbies: {
        type: "array",
        items: { type: "string" },
        description: "1-3 hobbies or interests the user mentioned.",
      },
      personality_notes: {
        type: "string",
        description:
          "1-2 sentences capturing how to motivate this specific person — their tone, what they respond to, a reference point they gave you.",
      },
      wrap_up_message: {
        type: "string",
        description:
          "Short final message (1-2 sentences) shown to the user after saving. Punchy and in-character.",
      },
    },
    required: ["primary_goals", "wrap_up_message"],
  },
};
