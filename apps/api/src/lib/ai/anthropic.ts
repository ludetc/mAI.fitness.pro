import type { Provider } from "./provider.js";
import { ProviderError } from "./provider.js";
import type {
  ChatMessageText,
  ChatRequest,
  ChatResult,
  ToolCall,
  ToolDefinition,
} from "./types.js";

interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}
type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence" | string;
}

export class AnthropicProvider implements Provider {
  readonly name = "anthropic" as const;
  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const messages: AnthropicMessage[] = [];
    for (const m of req.messages) {
      const converted = toAnthropicMessage(m);
      if (converted) messages.push(converted);
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: req.temperature ?? 0.6,
      max_tokens: req.maxTokens ?? 1024,
    };
    if (req.system) body.system = req.system;
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map(toAnthropicTool);
      if (req.toolChoice === "any") body.tool_choice = { type: "any" };
      else if (req.toolChoice && typeof req.toolChoice === "object")
        body.tool_choice = { type: "tool", name: req.toolChoice.name };
      else body.tool_choice = { type: "auto" };
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(
        `anthropic chat failed: ${res.status}`,
        "anthropic",
        res.status,
        text,
      );
    }

    const json = (await res.json()) as AnthropicResponse;
    const textParts: string[] = [];
    const toolCalls: ToolCall[] = [];
    for (const block of json.content) {
      if (block.type === "text") textParts.push(block.text);
      else if (block.type === "tool_use")
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }

    const stopReason: ChatResult["stopReason"] =
      json.stop_reason === "tool_use"
        ? "tool_use"
        : json.stop_reason === "end_turn" || json.stop_reason === "stop_sequence"
          ? "stop"
          : json.stop_reason === "max_tokens"
            ? "length"
            : "other";

    return {
      text: textParts.join(""),
      toolCalls,
      stopReason,
      raw: json,
    };
  }
}

function toAnthropicMessage(m: ChatMessageText): AnthropicMessage | null {
  if (m.role === "system") return null; // system is top-level on Anthropic
  if (m.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: m.toolCallId ?? "",
          content: m.content,
        },
      ],
    };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    const blocks: AnthropicBlock[] = [];
    if (m.content) blocks.push({ type: "text", text: m.content });
    for (const tc of m.toolCalls) {
      blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
    }
    return { role: "assistant", content: blocks };
  }
  return { role: m.role as "user" | "assistant", content: m.content };
}

function toAnthropicTool(t: ToolDefinition): object {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  };
}
