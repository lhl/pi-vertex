import { describe, expect, it } from "vitest";
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from "../types.js";
import { convertToGeminiMessages } from "../utils.js";

const baseAssistant: AssistantMessage = {
  role: "assistant",
  content: [],
  api: "google-generative-ai",
  provider: "vertex",
  model: "gemini-2.5-pro",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: "stop",
  timestamp: Date.now(),
};

function user(content: string | UserMessage["content"]): UserMessage {
  return { role: "user", content, timestamp: Date.now() };
}

function assistant(partial: Partial<AssistantMessage>): AssistantMessage {
  return { ...baseAssistant, ...partial };
}

function toolResult(
  toolCallId: string,
  toolName: string,
  content: ToolResultMessage["content"],
  isError = false,
): ToolResultMessage {
  return { role: "toolResult", toolCallId, toolName, content, isError, timestamp: Date.now() };
}

describe("convertToGeminiMessages", () => {
  describe("user messages", () => {
    it("converts simple text user message", () => {
      const messages: Message[] = [user("Hello Gemini")];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([{ role: "user", parts: [{ text: "Hello Gemini" }] }]);
    });

    it("skips empty/whitespace-only text user messages", () => {
      const messages: Message[] = [user("   "), user("Hello")];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([{ role: "user", parts: [{ text: "Hello" }] }]);
    });

    it("converts user message with text and image parts", () => {
      const messages: Message[] = [
        user([
          { type: "text", text: "Describe this image:" },
          { type: "image", data: "base64data", mimeType: "image/png" },
        ]),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([
        {
          role: "user",
          parts: [
            { text: "Describe this image:" },
            { inlineData: { mimeType: "image/png", data: "base64data" } },
          ],
        },
      ]);
    });

    it("sanitizes lone surrogates in user text", () => {
      const messages: Message[] = [user("Hello \uD800 world")];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0].text).toBe("Hello \uFFFD world");
    });
  });

  describe("assistant messages", () => {
    it("converts assistant text block", () => {
      const messages: Message[] = [assistant({ content: [{ type: "text", text: "I can help!" }] })];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([{ role: "model", parts: [{ text: "I can help!" }] }]);
    });

    it("skips empty text blocks", () => {
      const messages: Message[] = [
        assistant({
          content: [
            { type: "text", text: "" },
            { type: "text", text: "valid" },
          ],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts).toEqual([{ text: "valid" }]);
    });

    it("skips errored assistant messages", () => {
      const messages: Message[] = [
        assistant({ stopReason: "error", content: [{ type: "text", text: "oops" }] }),
        user("retry"),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([{ role: "user", parts: [{ text: "retry" }] }]);
    });

    it("skips aborted assistant messages", () => {
      const messages: Message[] = [
        assistant({ stopReason: "aborted", content: [{ type: "text", text: "stopped" }] }),
        user("continue"),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([{ role: "user", parts: [{ text: "continue" }] }]);
    });

    it("preserves thoughtSignature for same provider+model", () => {
      const messages: Message[] = [
        assistant({
          provider: "vertex",
          model: "gemini-2.5-pro",
          content: [{ type: "text", text: "Hello", textSignature: "abc123==" }],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0]).toEqual({ text: "Hello", thoughtSignature: "abc123==" });
    });

    it("drops invalid textSignature for same provider+model", () => {
      const messages: Message[] = [
        assistant({
          provider: "vertex",
          model: "gemini-2.5-pro",
          content: [{ type: "text", text: "Hello", textSignature: "not-valid!" }],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0]).toEqual({ text: "Hello" }); // no thoughtSignature
    });

    it("drops textSignature for different model (cross-provider)", () => {
      const messages: Message[] = [
        assistant({
          provider: "vertex",
          model: "gemini-2.0-flash",
          content: [{ type: "text", text: "Hello", textSignature: "abc123==" }],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0]).toEqual({ text: "Hello" }); // no thoughtSignature
    });
  });

  describe("thinking blocks", () => {
    it("converts thinking to thought part for same provider+model", () => {
      const messages: Message[] = [
        assistant({
          provider: "vertex",
          model: "gemini-2.5-pro",
          content: [{ type: "thinking", thinking: "Let me think..." }],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0]).toEqual({
        thought: true,
        text: "Let me think...",
      });
    });

    it("converts thinking to plain text for cross-model", () => {
      const messages: Message[] = [
        assistant({
          provider: "vertex",
          model: "gemini-2.0-flash",
          content: [{ type: "thinking", thinking: "Let me think..." }],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0]).toEqual({ text: "Let me think..." });
    });

    it("skips redacted thinking", () => {
      const messages: Message[] = [
        assistant({
          content: [
            { type: "thinking", thinking: "", redacted: true, thinkingSignature: "abc123==" },
          ],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([]);
    });

    it("skips empty thinking", () => {
      const messages: Message[] = [assistant({ content: [{ type: "thinking", thinking: "   " }] })];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([]);
    });

    it("preserves valid thinkingSignature", () => {
      const messages: Message[] = [
        assistant({
          provider: "vertex",
          model: "gemini-2.5-pro",
          content: [{ type: "thinking", thinking: "deep thought", thinkingSignature: "abc123==" }],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0]).toEqual({
        thought: true,
        text: "deep thought",
        thoughtSignature: "abc123==",
      });
    });
  });

  describe("toolCall blocks", () => {
    it("converts toolCall without id for Gemini models", () => {
      const messages: Message[] = [
        assistant({
          content: [
            { type: "toolCall", id: "tc-1", name: "read", arguments: { path: "/tmp/test" } },
          ],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0]).toEqual({
        functionCall: { name: "read", args: { path: "/tmp/test" } },
      });
    });

    it("includes id for Claude models", () => {
      const messages: Message[] = [
        assistant({
          content: [
            { type: "toolCall", id: "tc-1", name: "read", arguments: { path: "/tmp/test" } },
          ],
        }),
      ];
      const result = convertToGeminiMessages(messages, "claude-sonnet-4-6");
      expect(result[0].parts[0]).toEqual({
        functionCall: { name: "read", args: { path: "/tmp/test" }, id: "tc-1" },
      });
    });

    it("includes id for GPT-OSS models", () => {
      const messages: Message[] = [
        assistant({
          content: [{ type: "toolCall", id: "tc-1", name: "read", arguments: {} }],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gpt-oss-120b");
      expect(result[0].parts[0]).toEqual({
        functionCall: { name: "read", args: {}, id: "tc-1" },
      });
    });

    it("uses skip_thought_signature_validator for Gemini 3 without signature", () => {
      const messages: Message[] = [
        assistant({
          content: [{ type: "toolCall", id: "tc-1", name: "read", arguments: {} }],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-3-pro");
      expect(result[0].parts[0]).toEqual({
        functionCall: { name: "read", args: {} },
        thoughtSignature: "skip_thought_signature_validator",
      });
    });

    it("preserves thoughtSignature on toolCall when valid", () => {
      const messages: Message[] = [
        assistant({
          provider: "vertex",
          model: "gemini-2.5-pro",
          content: [
            {
              type: "toolCall",
              id: "tc-1",
              name: "read",
              arguments: {},
              thoughtSignature: "abc123==",
            },
          ],
        }),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0]).toEqual({
        functionCall: { name: "read", args: {} },
        thoughtSignature: "abc123==",
      });
    });
  });

  describe("toolResult messages", () => {
    it("converts toolResult to functionResponse", () => {
      const messages: Message[] = [
        toolResult("tc-1", "read", [{ type: "text", text: "file contents" }]),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0]).toEqual({
        role: "user",
        parts: [{ functionResponse: { name: "read", response: { output: "file contents" } } }],
      });
    });

    it("marks error toolResult", () => {
      const messages: Message[] = [
        toolResult("tc-1", "read", [{ type: "text", text: "not found" }], true),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0].functionResponse.response).toEqual({ error: "not found" });
    });

    it("merges consecutive toolResults into single user turn", () => {
      const messages: Message[] = [
        toolResult("tc-1", "read", [{ type: "text", text: "content1" }]),
        toolResult("tc-2", "write", [{ type: "text", text: "content2" }]),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("user");
      expect(result[0].parts).toHaveLength(2);
    });

    it("includes toolCallId for Claude models", () => {
      const messages: Message[] = [
        toolResult("tc-1", "read", [{ type: "text", text: "contents" }]),
      ];
      const result = convertToGeminiMessages(messages, "claude-sonnet-4-6");
      expect(result[0].parts[0].functionResponse.id).toBe("tc-1");
    });

    it("handles empty toolResult content", () => {
      const messages: Message[] = [toolResult("tc-1", "read", [{ type: "text", text: "" }])];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0].functionResponse.response.output).toBe("");
    });
  });

  describe("full conversation", () => {
    it("handles multi-turn with text, tool calls, and results", () => {
      const messages: Message[] = [
        user("Read file"),
        assistant({
          content: [
            { type: "text", text: "I'll read it." },
            { type: "toolCall", id: "tc-1", name: "read", arguments: { path: "/tmp/test" } },
          ],
        }),
        toolResult("tc-1", "read", [{ type: "text", text: "hello" }]),
        user("thanks"),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([
        { role: "user", parts: [{ text: "Read file" }] },
        {
          role: "model",
          parts: [
            { text: "I'll read it." },
            { functionCall: { name: "read", args: { path: "/tmp/test" } } },
          ],
        },
        {
          role: "user",
          parts: [{ functionResponse: { name: "read", response: { output: "hello" } } }],
        },
        { role: "user", parts: [{ text: "thanks" }] },
      ]);
    });
  });
});
