import type { ChatRequest, ChatResult } from "./types.js";

export interface Provider {
  readonly name: "openai" | "anthropic";
  readonly model: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
