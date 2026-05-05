/**
 * Export all Vertex AI model definitions
 */

import type { VertexModelConfig } from "../types.js";
import { CLAUDE_MODELS } from "./claude.js";
import { GEMINI_MODELS } from "./gemini.js";
import { MAAS_MODELS } from "./maas.js";

export const ALL_MODELS: VertexModelConfig[] = [
  ...GEMINI_MODELS,
  ...CLAUDE_MODELS,
  ...MAAS_MODELS,
].sort((a, b) => a.id.localeCompare(b.id));

export function getModelById(id: string): VertexModelConfig | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

export function getModelsByEndpointType(type: "gemini" | "maas"): VertexModelConfig[] {
  return ALL_MODELS.filter((m) => m.endpointType === type);
}

export { GEMINI_MODELS, CLAUDE_MODELS, MAAS_MODELS };
