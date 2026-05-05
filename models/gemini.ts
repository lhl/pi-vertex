/**
 * Gemini model definitions for Vertex AI
 * Source: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models
 * Pricing: https://cloud.google.com/vertex-ai/generative-ai/pricing
 * All prices per 1M tokens (standard tier, <= 200K input tokens)
 */

import type { VertexModelConfig } from "../types.js";

export const GEMINI_MODELS: VertexModelConfig[] = [
  // --- Gemini 3.1 (Preview) ---
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    apiId: "gemini-3.1-pro-preview",
    publisher: "google",
    endpointType: "gemini",
    contextWindow: 1048576,
    maxTokens: 65536,
    input: ["text", "image"],
    reasoning: true,
    tools: true,
    cost: {
      input: 2.0,
      output: 12.0,
      cacheRead: 0.2,
      cacheWrite: 0,
    },
    region: "global",
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    apiId: "gemini-3.1-flash-lite-preview",
    publisher: "google",
    endpointType: "gemini",
    contextWindow: 1048576,
    maxTokens: 65535,
    input: ["text", "image"],
    reasoning: true,
    tools: true,
    cost: {
      input: 0.25,
      output: 1.5,
      cacheRead: 0.025,
      cacheWrite: 0,
    },
    region: "global",
  },

  // --- Gemini 3 (Preview) ---
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    apiId: "gemini-3-flash-preview",
    publisher: "google",
    endpointType: "gemini",
    contextWindow: 1048576,
    maxTokens: 65536,
    input: ["text", "image"],
    reasoning: true,
    tools: true,
    cost: {
      input: 0.5,
      output: 3.0,
      cacheRead: 0.05,
      cacheWrite: 0,
    },
    region: "global",
  },

  // --- Gemini 2.5 (GA) ---
  {
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
    cost: {
      input: 1.25,
      output: 10.0,
      cacheRead: 0.125,
      cacheWrite: 0,
    },
    region: "global",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    apiId: "gemini-2.5-flash",
    publisher: "google",
    endpointType: "gemini",
    contextWindow: 1048576,
    maxTokens: 65536,
    input: ["text", "image"],
    reasoning: true,
    tools: true,
    cost: {
      input: 0.3,
      output: 2.5,
      cacheRead: 0.03,
      cacheWrite: 0,
    },
    region: "global",
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    apiId: "gemini-2.5-flash-lite",
    publisher: "google",
    endpointType: "gemini",
    contextWindow: 1048576,
    maxTokens: 65536,
    input: ["text", "image"],
    reasoning: true,
    tools: true,
    cost: {
      input: 0.1,
      output: 0.4,
      cacheRead: 0.01,
      cacheWrite: 0,
    },
    region: "global",
  },

  // --- Gemini 2.0 (GA) ---
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    apiId: "gemini-2.0-flash",
    publisher: "google",
    endpointType: "gemini",
    contextWindow: 1048576,
    maxTokens: 8192,
    input: ["text", "image"],
    reasoning: false,
    tools: true,
    cost: {
      input: 0.15,
      output: 0.6,
      cacheRead: 0,
      cacheWrite: 0,
    },
    region: "global",
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    apiId: "gemini-2.0-flash-lite",
    publisher: "google",
    endpointType: "gemini",
    contextWindow: 1048576,
    maxTokens: 8192,
    input: ["text", "image"],
    reasoning: false,
    tools: true,
    cost: {
      input: 0.075,
      output: 0.3,
      cacheRead: 0,
      cacheWrite: 0,
    },
    region: "global",
  },
];
