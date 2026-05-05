import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamGemini } from "../streaming/gemini.js";
import type { AssistantMessageEvent, Context, VertexModelConfig } from "../types.js";

const mocks = vi.hoisted(() => ({
  generateContentStream: vi.fn(),
  getAuthConfig: vi.fn(),
  googleGenAI: vi.fn(),
  resolveLocation: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  FinishReason: {
    STOP: "STOP",
    MAX_TOKENS: "MAX_TOKENS",
    SAFETY: "SAFETY",
  },
  GoogleGenAI: mocks.googleGenAI,
  ThinkingLevel: {
    MINIMAL: "MINIMAL",
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
  },
}));

vi.mock("../auth.js", () => ({
  getAuthConfig: mocks.getAuthConfig,
  resolveLocation: mocks.resolveLocation,
}));

const baseContext: Context = { messages: [] };

function makeModel(overrides: Partial<VertexModelConfig> = {}): VertexModelConfig {
  return {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    apiId: "gemini-2.5-pro",
    publisher: "google",
    endpointType: "gemini",
    contextWindow: 1048576,
    maxTokens: 65536,
    input: ["text", "image"],
    reasoning: true,
    tools: true,
    cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 0 },
    region: "global",
    ...overrides,
  };
}

async function* chunks<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

async function collectEvents(stream: AsyncIterable<AssistantMessageEvent>) {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("streamGemini", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveLocation.mockImplementation((region?: string) => region ?? "us-central1");
    mocks.getAuthConfig.mockReturnValue({ projectId: "test-project", location: "global" });
    mocks.googleGenAI.mockImplementation(() => ({
      models: { generateContentStream: mocks.generateContentStream },
    }));
    mocks.generateContentStream.mockReturnValue(
      chunks([{ candidates: [{ finishReason: "STOP" }] }]),
    );
  });

  it("uses the lowest supported Gemini 2.5 thinking config when Pi reasoning is not requested", async () => {
    await collectEvents(streamGemini(makeModel(), baseContext));

    expect(mocks.generateContentStream).toHaveBeenCalledOnce();
    expect(mocks.generateContentStream.mock.calls[0][0].config.thinkingConfig).toEqual({
      thinkingBudget: 128,
    });

    mocks.generateContentStream.mockClear();

    await collectEvents(
      streamGemini(makeModel({ id: "gemini-2.5-flash", apiId: "gemini-2.5-flash" }), baseContext),
    );

    expect(mocks.generateContentStream.mock.calls[0][0].config.thinkingConfig).toEqual({
      thinkingBudget: 0,
    });
  });

  it("maps Gemini 3 Pro thinking levels to supported Vertex values", async () => {
    await collectEvents(
      streamGemini(
        makeModel({ id: "gemini-3.1-pro", apiId: "gemini-3.1-pro-preview" }),
        baseContext,
        { reasoning: "minimal" },
      ),
    );

    expect(mocks.generateContentStream.mock.calls[0][0].config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: "LOW",
    });

    mocks.generateContentStream.mockClear();

    await collectEvents(
      streamGemini(
        makeModel({ id: "gemini-3.1-pro", apiId: "gemini-3.1-pro-preview" }),
        baseContext,
        { reasoning: "medium" },
      ),
    );

    expect(mocks.generateContentStream.mock.calls[0][0].config.thinkingConfig).toEqual({
      includeThoughts: true,
      thinkingLevel: "MEDIUM",
    });
  });

  it("does not double-count cached input tokens in usage cost", async () => {
    mocks.generateContentStream.mockReturnValue(
      chunks([
        {
          candidates: [{ finishReason: "STOP" }],
          usageMetadata: {
            promptTokenCount: 100,
            cachedContentTokenCount: 40,
            candidatesTokenCount: 20,
            thoughtsTokenCount: 5,
            totalTokenCount: 125,
          },
        },
      ]),
    );

    const events = await collectEvents(streamGemini(makeModel(), baseContext));
    const done = events.find((event) => event.type === "done");

    expect(done?.type).toBe("done");
    if (done?.type !== "done") throw new Error("Expected done event");

    expect(done.message.usage).toMatchObject({
      input: 60,
      output: 25,
      cacheRead: 40,
      totalTokens: 125,
    });
    expect(done.message.usage.cost.input).toBeCloseTo(0.00012);
    expect(done.message.usage.cost.output).toBeCloseTo(0.00025);
    expect(done.message.usage.cost.cacheRead).toBeCloseTo(0.000008);
    expect(done.message.usage.cost.total).toBeCloseTo(0.000378);
  });

  it("terminates safety finish reasons as error events", async () => {
    mocks.generateContentStream.mockReturnValue(
      chunks([{ candidates: [{ finishReason: "SAFETY" }] }]),
    );

    const events = await collectEvents(streamGemini(makeModel(), baseContext));
    const last = events.at(-1);

    expect(last?.type).toBe("error");
    expect(events.some((event) => event.type === "done")).toBe(false);
    if (last?.type === "error") {
      expect(last.reason).toBe("error");
      expect(last.error.errorMessage).toBe("Content blocked by safety filters");
    }
  });
});
