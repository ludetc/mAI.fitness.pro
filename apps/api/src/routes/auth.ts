import { Hono } from "hono";
import type { AuthGoogleRequest, AuthGoogleResponse } from "@mai/shared";
import type { Env, Variables } from "../env.js";
import { verifyGoogleIdToken } from "../lib/google.js";
import { signSession } from "../lib/jwt.js";
import { upsertUser } from "../lib/db.js";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

authRoutes.post("/google", async (c) => {
  let body: AuthGoogleRequest;
  try {
    body = await c.req.json<AuthGoogleRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!body.idToken || typeof body.idToken !== "string") {
    return c.json({ error: "missing_id_token" }, 400);
  }

  const google = await verifyGoogleIdToken(body.idToken, c.env.GOOGLE_CLIENT_ID);
  if (!google) {
    return c.json({ error: "invalid_id_token" }, 401);
  }

  const user = await upsertUser(c.env.DB, google);
  const token = await signSession(user.id, c.env.JWT_SECRET);

  const res: AuthGoogleResponse = { token, user };
  return c.json(res);
});
