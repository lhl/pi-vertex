import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantMessageEvent, Context, VertexModelConfig } from "../types.js";

const mocks = vi.hoisted(() => ({
  // @anthropic-ai/vertex-sdk
  anthropicVertex: vi.fn(),
  anthropicStream: vi.fn(),
  // pi-ai openai-completions path
  streamSimpleOpenAICompletions: vi.fn(),
  // auth
  getAuthConfig: vi.fn(),
  resolveLocation: vi.fn(),
  getAccessToken: vi.fn(),
  buildBaseUrl: vi.fn(),
}));

vi.mock("@anthropic-ai/vertex-sdk", () => ({
  AnthropicVertex: mocks.anthropicVertex,
}));

vi.mock("@mariozechner/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mariozechner/pi-ai")>();
  return {
    ...actual,
    streamSimpleOpenAICompletions: mocks.streamSimpleOpenAICompletions,
  };
});

vi.mock("../auth.js", () => ({
  getAuthConfig: mocks.getAuthConfig,
  resolveLocation: mocks.resolveLocation,
  getAccessToken: mocks.getAccessToken,
  buildBaseUrl: mocks.buildBaseUrl,
}));

// Import AFTER mocks are registered
import { streamMaaS } from "../streaming/maas.js";

const baseContext: Context = { messages: [] };

function makeAnthropicModel(overrides: Partial<VertexModelConfig> = {}): VertexModelConfig {
  return {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    apiId: "claude-sonnet-4-5@20250929",
    publisher: "anthropic",
    endpointType: "maas",
    contextWindow: 200000,
    maxTokens: 64000,
    input: ["text", "image"],
    reasoning: true,
    tools: true,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    region: "global",
    ...overrides,
  };
}

function makeOpenAICompatModel(overrides: Partial<VertexModelConfig> = {}): VertexModelConfig {
  return {
    id: "llama-4-scout",
    name: "Llama 4 Scout",
    apiId: "meta/llama-4-scout-17b-16e-instruct-maas",
    publisher: "meta",
    endpointType: "maas",
    contextWindow: 1310720,
    maxTokens: 32000,
    input: ["text"],
    reasoning: false,
    tools: true,
    cost: { input: 0.25, output: 0.7, cacheRead: 0, cacheWrite: 0 },
    region: "global",
    ...overrides,
  };
}

async function* asyncIter<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

async function collectEvents(stream: AsyncIterable<AssistantMessageEvent>) {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("streamMaaS — Anthropic path", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveLocation.mockImplementation((region?: string) => region ?? "us-central1");
    mocks.getAuthConfig.mockReturnValue({ projectId: "test-project", location: "global" });
    mocks.anthropicVertex.mockImplementation(() => ({
      messages: { stream: mocks.anthropicStream },
    }));
  });

  it("emits start → text deltas → done in order on a happy-path stream", async () => {
    mocks.anthropicStream.mockReturnValue(
      asyncIter([
        {
          type: "message_start",
          message: {
            id: "msg_123",
            usage: { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
        },
        { type: "content_block_start", index: 0, content_block: { type: "text" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
      ]),
    );

    const events = await collectEvents(streamMaaS(makeAnthropicModel(), baseContext));

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("start");
    expect(types).toContain("text_start");
    expect(types).toContain("text_delta");
    expect(types).toContain("text_end");
    expect(types[types.length - 1]).toBe("done");

    const done = events.find((e) => e.type === "done");
    if (done?.type !== "done") throw new Error("Expected done event");
    expect(done.reason).toBe("stop");
    expect(done.message.usage.input).toBe(10);
    expect(done.message.usage.output).toBe(5);

    // Reconstructed text
    const text = events
      .filter((e) => e.type === "text_delta")
      .map((e) => (e.type === "text_delta" ? e.delta : ""))
      .join("");
    expect(text).toBe("Hello world");
  });

  it("calls stream.end() exactly once across the Anthropic path (no double-end regression)", async () => {
    // Spy on the prototype of the stream returned by the public factory.
    const piAi = await import("@mariozechner/pi-ai");
    const sample = piAi.createAssistantMessageEventStream();
    const proto = Object.getPrototypeOf(sample);
    const endSpy = vi.spyOn(proto, "end");

    mocks.anthropicStream.mockReturnValue(
      asyncIter([
        {
          type: "message_start",
          message: {
            id: "msg_1",
            usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
        },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
      ]),
    );

    // The `sample` stream we created above also goes through the prototype, but we
    // never call .end() on it manually — so any end() call counted here comes from
    // streamMaaS / streamAnthropic. That's exactly what we want to assert.
    await collectEvents(streamMaaS(makeAnthropicModel(), baseContext));

    expect(endSpy).toHaveBeenCalledTimes(1);
    endSpy.mockRestore();
  });

  it("emits a single error event when AnthropicVertex throws synchronously", async () => {
    mocks.anthropicStream.mockImplementation(() => {
      throw new Error("boom");
    });

    const events = await collectEvents(streamMaaS(makeAnthropicModel(), baseContext));

    const last = events.at(-1);
    expect(last?.type).toBe("error");
    expect(events.some((e) => e.type === "done")).toBe(false);
    if (last?.type === "error") {
      expect(last.error.errorMessage).toBe("boom");
      expect(last.error.model).toBe("claude-sonnet-4-5");
    }
  });

  it("flips stopReason to toolUse when a tool_use block is present", async () => {
    mocks.anthropicStream.mockReturnValue(
      asyncIter([
        {
          type: "message_start",
          message: {
            id: "msg_t",
            usage: { input_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
        },
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "tu_1", name: "read" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"path":"/tmp"}' },
        },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 3 } },
      ]),
    );

    const events = await collectEvents(streamMaaS(makeAnthropicModel(), baseContext));
    const done = events.find((e) => e.type === "done");
    if (done?.type !== "done") throw new Error("Expected done event");
    expect(done.reason).toBe("toolUse");
    const toolCall = done.message.content.find((b: any) => b.type === "toolCall");
    expect(toolCall).toMatchObject({ name: "read", arguments: { path: "/tmp" } });
  });
});

describe("streamMaaS — OpenAI-compat path", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveLocation.mockImplementation((region?: string) => region ?? "us-central1");
    mocks.getAuthConfig.mockReturnValue({ projectId: "test-project", location: "global" });
    mocks.getAccessToken.mockResolvedValue("fake-token");
    mocks.buildBaseUrl.mockReturnValue("https://example/v1/projects/p/locations/global");
  });

  it("relays inner OpenAI events and rewrites model id on done", async () => {
    const innerEvents: AssistantMessageEvent[] = [
      {
        type: "start",
        partial: {
          role: "assistant",
          content: [],
          api: "openai-completions",
          provider: "vertex",
          model: "meta/llama-4-scout-17b-16e-instruct-maas",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: 0,
        },
      },
      {
        type: "done",
        reason: "stop",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hi" }],
          api: "openai-completions",
          provider: "vertex",
          model: "meta/llama-4-scout-17b-16e-instruct-maas",
          usage: {
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 2,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
          timestamp: 0,
        },
      },
    ];
    mocks.streamSimpleOpenAICompletions.mockReturnValue(asyncIter(innerEvents));

    const events = await collectEvents(streamMaaS(makeOpenAICompatModel(), baseContext));
    const done = events.find((e) => e.type === "done");
    if (done?.type !== "done") throw new Error("Expected done event");

    // The outer wrapper rewrites .model to the public id (not the apiId).
    expect(done.message.model).toBe("llama-4-scout");
  });
});
