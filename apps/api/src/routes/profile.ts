import { Hono } from "hono";
import type { ProfileStatusResponse } from "@mai/shared";
import type { Env, Variables } from "../env.js";
import { requireAuth } from "../middleware/auth.js";
import { getLatestConversationByKind, getProfile } from "../lib/db.js";

export const profileRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

profileRoutes.use("*", requireAuth);

profileRoutes.get("/", async (c) => {
  const user = c.get("user");
  const [profile, convo] = await Promise.all([
    getProfile(c.env.DB, user.id),
    getLatestConversationByKind(c.env.DB, user.id, "onboarding"),
  ]);
  const res: ProfileStatusResponse = {
    profile,
    onboardingConversationId: convo?.id ?? null,
  };
  return c.json(res);
});
