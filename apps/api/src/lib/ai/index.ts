import type { Env } from "../../env.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import type { Provider } from "./provider.js";
import type { AiRole } from "./types.js";

export * from "./types.js";
export * from "./provider.js";

interface ProviderSpec {
  provider: "openai" | "anthropic";
  model: string;
}

function parseSpec(raw: string | undefined, fallback: ProviderSpec): ProviderSpec {
  if (!raw) return fallback;
  const [providerRaw, ...modelParts] = raw.split("/");
  const model = modelParts.join("/").trim();
  const provider = providerRaw?.trim().toLowerCase();
  if (!model || (provider !== "openai" && provider !== "anthropic")) return fallback;
  return { provider, model };
}

function specForRole(env: Env, role: AiRole): ProviderSpec {
  switch (role) {
    case "chat":
      return parseSpec(env.AI_MODEL_CHAT, { provider: "openai", model: "gpt-4o-mini" });
    case "planning":
      return parseSpec(env.AI_MODEL_PLANNING, {
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
      });
    case "vision":
      return parseSpec(env.AI_MODEL_VISION, { provider: "openai", model: "gpt-4o" });
  }
}

export function getProvider(env: Env, role: AiRole): Provider {
  const spec = specForRole(env, role);
  if (spec.provider === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    return new OpenAIProvider(spec.model, env.OPENAI_API_KEY);
  }
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new AnthropicProvider(spec.model, env.ANTHROPIC_API_KEY);
}
