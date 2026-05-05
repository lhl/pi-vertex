import { describe, expect, it, vi } from "vitest";
import { streamVertex } from "../streaming/index.js";
import type { Context, StreamOptions, VertexModelConfig } from "../types.js";

// Mock the underlying streamers so we only test dispatch logic
vi.mock("../streaming/gemini.js", () => ({
  streamGemini: vi.fn((model: VertexModelConfig) => {
    return { model: model.id, source: "gemini" } as any;
  }),
}));

vi.mock("../streaming/maas.js", () => ({
  streamMaaS: vi.fn((model: VertexModelConfig) => {
    return { model: model.id, source: "maas" } as any;
  }),
}));

import { streamGemini } from "../streaming/gemini.js";
import { streamMaaS } from "../streaming/maas.js";

const baseContext: Context = { messages: [] };
const baseOptions: StreamOptions = {};

function makeModel(endpointType: "gemini" | "maas", id = "test-model"): VertexModelConfig {
  return {
    id,
    name: "Test",
    apiId: id,
    publisher: endpointType === "gemini" ? "google" : "anthropic",
    endpointType,
    contextWindow: 128000,
    maxTokens: 4096,
    input: ["text"],
    reasoning: false,
    tools: true,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    region: "global",
  };
}

describe("streamVertex dispatch", () => {
  beforeEach(() => {
    vi.mocked(streamGemini).mockClear();
    vi.mocked(streamMaaS).mockClear();
  });

  it("dispatches gemini models to streamGemini", () => {
    const model = makeModel("gemini", "gemini-2.5-pro");
    const result = streamVertex(model, baseContext, baseOptions);

    expect(streamGemini).toHaveBeenCalledOnce();
    expect(streamGemini).toHaveBeenCalledWith(model, baseContext, baseOptions);
    expect(result).toEqual({ model: "gemini-2.5-pro", source: "gemini" });
  });

  it("dispatches maas models to streamMaaS", () => {
    const model = makeModel("maas", "claude-opus-4-6");
    const result = streamVertex(model, baseContext, baseOptions);

    expect(streamMaaS).toHaveBeenCalledOnce();
    expect(streamMaaS).toHaveBeenCalledWith(model, baseContext, baseOptions);
    expect(result).toEqual({ model: "claude-opus-4-6", source: "maas" });
  });

  it("throws on unknown endpoint type", () => {
    const model = { ...makeModel("gemini"), endpointType: "unknown" as any };
    expect(() => streamVertex(model, baseContext, baseOptions)).toThrow(
      "Unknown endpoint type: unknown",
    );
  });
});
