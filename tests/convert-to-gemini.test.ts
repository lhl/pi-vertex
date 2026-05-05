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
      expect(result[0].parts[0].text).toBe("Hello  world");
    });

    it("preserves valid surrogate pairs in user text", () => {
      const messages: Message[] = [user("Hello 😀 world")];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result[0].parts[0].text).toBe("Hello 😀 world");
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
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro") as any;
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

    it("handles empty toolResult content", () => {
      const messages: Message[] = [toolResult("tc-1", "read", [{ type: "text", text: "" }])];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro") as any;
      expect(result[0].parts[0].functionResponse.response.output).toBe("");
    });

    it("includes image toolResult parts inside Gemini 3 functionResponse", () => {
      const messages: Message[] = [
        toolResult("tc-1", "screenshot", [
          { type: "text", text: "screen" },
          { type: "image", data: "base64img", mimeType: "image/png" },
        ]),
      ];
      const result = convertToGeminiMessages(messages, "gemini-3-pro");
      expect(result).toEqual([
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: "screenshot",
                response: { output: "screen" },
                parts: [{ inlineData: { mimeType: "image/png", data: "base64img" } }],
              },
            },
          ],
        },
      ]);
    });

    it("sends image toolResult parts as a separate user turn for Gemini 2.5", () => {
      const messages: Message[] = [
        toolResult("tc-1", "screenshot", [
          { type: "image", data: "base64img", mimeType: "image/png" },
        ]),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: "screenshot",
                response: { output: "(see attached image)" },
              },
            },
          ],
        },
        {
          role: "user",
          parts: [
            { text: "Tool result image:" },
            { inlineData: { mimeType: "image/png", data: "base64img" } },
          ],
        },
      ]);
    });

    it("synthesizes missing toolResults before the next user turn", () => {
      const messages: Message[] = [
        assistant({
          content: [
            { type: "toolCall", id: "tc-1", name: "read", arguments: { path: "/tmp/test" } },
            { type: "toolCall", id: "tc-2", name: "write", arguments: { path: "/tmp/out" } },
          ],
        }),
        toolResult("tc-1", "read", [{ type: "text", text: "contents" }]),
        user("continue"),
      ];
      const result = convertToGeminiMessages(messages, "gemini-2.5-pro");
      expect(result).toEqual([
        {
          role: "model",
          parts: [
            { functionCall: { name: "read", args: { path: "/tmp/test" } } },
            { functionCall: { name: "write", args: { path: "/tmp/out" } } },
          ],
        },
        {
          role: "user",
          parts: [
            { functionResponse: { name: "read", response: { output: "contents" } } },
            {
              functionResponse: {
                name: "write",
                response: { error: "No result provided" },
              },
            },
          ],
        },
        { role: "user", parts: [{ text: "continue" }] },
      ]);
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
