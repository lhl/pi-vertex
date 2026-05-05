import { describe, expect, it } from "vitest";
import { ALL_MODELS, getModelById, getModelsByEndpointType } from "../models/index.js";

describe("models", () => {
  it("has at least 36 models registered", () => {
    expect(ALL_MODELS.length).toBeGreaterThanOrEqual(36);
  });

  it("every model has required fields", () => {
    for (const model of ALL_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.apiId).toBeTruthy();
      expect(model.publisher).toBeTruthy();
      expect(model.endpointType).toMatch(/^(gemini|maas)$/);
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
      expect(model.cost.input).toBeGreaterThanOrEqual(0);
      expect(model.cost.output).toBeGreaterThanOrEqual(0);
    }
  });

  it("has unique ids", () => {
    const ids = ALL_MODELS.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("getModelById returns model when found", () => {
    const model = getModelById("claude-opus-4-7");
    expect(model).toBeDefined();
    expect(model?.name).toBe("Claude Opus 4.7");
  });

  it("getModelById returns undefined when not found", () => {
    expect(getModelById("nonexistent-model")).toBeUndefined();
  });

  it("getModelsByEndpointType filters correctly", () => {
    const geminiModels = getModelsByEndpointType("gemini");
    expect(geminiModels.every((m) => m.endpointType === "gemini")).toBe(true);

    const maasModels = getModelsByEndpointType("maas");
    expect(maasModels.every((m) => m.endpointType === "maas")).toBe(true);
  });

  it("Claude models have correct publisher", () => {
    const claudeModels = ALL_MODELS.filter((m) => m.id.startsWith("claude-"));
    expect(claudeModels.length).toBeGreaterThan(0);
    for (const model of claudeModels) {
      expect(model.publisher).toBe("anthropic");
    }
  });

  it("Claude 4.6+ models use current Vertex output limits and pricing", () => {
    expect(getModelById("claude-opus-4-7")).toMatchObject({
      maxTokens: 128000,
      cost: { input: 5.5, output: 27.5, cacheRead: 0.55, cacheWrite: 6.875 },
    });
    expect(getModelById("claude-opus-4-6")).toMatchObject({
      maxTokens: 128000,
      cost: { input: 5.5, output: 27.5, cacheRead: 0.55, cacheWrite: 6.875 },
    });
    expect(getModelById("claude-sonnet-4-6")).toMatchObject({
      maxTokens: 128000,
      cost: { input: 3.3, output: 16.5, cacheRead: 0.33, cacheWrite: 4.125 },
    });
  });

  it("Gemini models have correct publisher", () => {
    const geminiModels = ALL_MODELS.filter((m) => m.id.startsWith("gemini-"));
    expect(geminiModels.length).toBeGreaterThan(0);
    for (const model of geminiModels) {
      expect(model.publisher).toBe("google");
    }
  });
});
