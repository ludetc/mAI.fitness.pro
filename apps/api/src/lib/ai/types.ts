export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessageText {
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatRequest {
  system?: string;
  messages: ChatMessageText[];
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "any" | { name: string };
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: "stop" | "tool_use" | "length" | "other";
  raw?: unknown;
}

export type JsonSchema =
  | { type: "string"; description?: string; enum?: string[] }
  | { type: "number"; description?: string }
  | { type: "integer"; description?: string }
  | { type: "boolean"; description?: string }
  | { type: "array"; description?: string; items: JsonSchema }
  | {
      type: "object";
      description?: string;
      properties: Record<string, JsonSchema>;
      required?: string[];
    };

export type AiRole = "chat" | "planning" | "vision";
