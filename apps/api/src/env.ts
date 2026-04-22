import type { User } from "@mai/shared";

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  AI_MODEL_CHAT?: string;
  AI_MODEL_PLANNING?: string;
  AI_MODEL_VISION?: string;
}

export interface Variables {
  user: User;
}
