import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { meRoutes } from "./routes/me.js";
import { profileRoutes } from "./routes/profile.js";
import { workoutsRoutes } from "./routes/workouts.js";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => {
      if (!origin) return "";
      if (allowedOrigins.includes(origin)) return origin;
      return "";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 600,
  })(c, next);
});

app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", authRoutes);
app.route("/me", meRoutes);
app.route("/me/profile", profileRoutes);
app.route("/chat", chatRoutes);
app.route("/workouts", workoutsRoutes);

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
