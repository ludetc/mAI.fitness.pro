import type { Provider } from "./provider.js";
import { ProviderError } from "./provider.js";
import type {
  ChatMessageText,
  ChatRequest,
  ChatResult,
  ToolCall,
  ToolDefinition,
} from "./types.js";

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
}

export class OpenAIProvider implements Provider {
  readonly name = "openai" as const;
  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const messages: OpenAIMessage[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    for (const m of req.messages) {
      messages.push(toOpenAIMessage(m));
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: req.temperature ?? 0.6,
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map(toOpenAITool);
      if (req.toolChoice === "any") body.tool_choice = "required";
      else if (req.toolChoice && typeof req.toolChoice === "object")
        body.tool_choice = { type: "function", function: { name: req.toolChoice.name } };
      else body.tool_choice = "auto";
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(
        `openai chat failed: ${res.status}`,
        "openai",
        res.status,
        text,
      );
    }

    const json = (await res.json()) as OpenAIResponse;
    const choice = json.choices[0];
    if (!choice) throw new ProviderError("openai: no choices", "openai", res.status, json);

    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeParseJson(tc.function.arguments),
    }));

    const stopReason: ChatResult["stopReason"] =
      choice.finish_reason === "tool_calls"
        ? "tool_use"
        : choice.finish_reason === "stop"
          ? "stop"
          : choice.finish_reason === "length"
            ? "length"
            : "other";

    return {
      text: choice.message.content ?? "",
      toolCalls,
      stopReason,
      raw: json,
    };
  }
}

function toOpenAIMessage(m: ChatMessageText): OpenAIMessage {
  if (m.role === "tool") {
    return {
      role: "tool",
      content: m.content,
      tool_call_id: m.toolCallId,
    };
  }
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.input) },
      })),
    };
  }
  return { role: m.role as "system" | "user" | "assistant", content: m.content };
}

function toOpenAITool(t: ToolDefinition): object {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  };
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
