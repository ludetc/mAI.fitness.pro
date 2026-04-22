import type { MiddlewareHandler } from "hono";
import type { Env, Variables } from "../env.js";
import { verifySession } from "../lib/jwt.js";
import { getUserById } from "../lib/db.js";

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next,
) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: "missing_bearer" }, 401);
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) return c.json({ error: "missing_bearer" }, 401);

  const payload = await verifySession(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: "invalid_session" }, 401);

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) return c.json({ error: "user_not_found" }, 401);

  c.set("user", user);
  await next();
  return undefined;
};
