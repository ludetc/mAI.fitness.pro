import { Hono } from "hono";
import type { MeResponse } from "@mai/shared";
import type { Env, Variables } from "../env.js";
import { requireAuth } from "../middleware/auth.js";

export const meRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

meRoutes.use("*", requireAuth);

meRoutes.get("/", (c) => {
  const user = c.get("user");
  const res: MeResponse = { user };
  return c.json(res);
});
