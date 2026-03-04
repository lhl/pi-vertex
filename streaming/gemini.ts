/**
 * Gemini streaming handler using @google/genai SDK
 *
 * Aligned with pi-mono's google-vertex.ts for consistent handling of:
 * - Thinking content (thought blocks with signatures)
 * - Tool calls with unique IDs and deduplication
 * - Thinking configuration (levels for Gemini 3, budgets for Gemini 2.5)
 * - Usage tracking including thinking tokens
 */

import { GoogleGenAI, FinishReason, ThinkingLevel } from "@google/genai";
import type { VertexModelConfig, Context, StreamOptions, AssistantMessage } from "../types.js";
import { getAuthConfig, resolveLocation } from "../auth.js";
import { sanitizeText, convertToGeminiMessages, convertToolsForGemini, retainThoughtSignature, calculateCost } from "../utils.js";
import { createAssistantMessageEventStream, type AssistantMessageEventStream } from "@mariozechner/pi-ai";

// Module-level counter for generating unique tool call IDs (matches pi-mono pattern)
let toolCallCounter = 0;

const THINKING_LEVEL_MAP: Record<string, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

function mapGeminiStopReason(reason: string): "stop" | "length" | "toolUse" | "error" {
  switch (reason) {
    case FinishReason.STOP:
      return "stop";
    case FinishReason.MAX_TOKENS:
      return "length";
    case FinishReason.SAFETY:
    case FinishReason.RECITATION:
    default:
      return "error";
  }
}

export function streamGemini(
  model: VertexModelConfig,
  context: Context,
  options?: StreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
      api: "google-generative-ai",
      provider: "vertex",
      model: model.id,
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

    try {
      // Priority: config file > env var > model region > default
      const location = resolveLocation(model.region);
      const auth = getAuthConfig(location);

      // Create client with explicit API version (matches pi-mono)
      const client = new GoogleGenAI({
        vertexai: true,
        project: auth.projectId,
        location: auth.location,
        apiVersion: "v1",
      });

      // Convert messages with model ID for proper thinking/tool handling
      const contents = convertToGeminiMessages(context.messages, model.apiId);

      // Build config — only set temperature when explicitly provided
      const config: any = {
        maxOutputTokens: options?.maxTokens || Math.floor(model.maxTokens / 2),
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
      };

      // Add system prompt if present
      if (context.systemPrompt) {
        config.systemInstruction = sanitizeText(context.systemPrompt);
      }

      // Add tools if present (using parametersJsonSchema for full JSON Schema support)
      if (context.tools && context.tools.length > 0) {
        config.tools = convertToolsForGemini(context.tools);
      }

      // Add thinking configuration (matches pi-mono's buildParams logic)
      if (model.reasoning && options?.reasoning) {
        const effort = options.reasoning === "xhigh" ? "high" : options.reasoning;
        const isGemini3 = model.apiId.startsWith("gemini-3");

        const thinkingConfig: any = { includeThoughts: true };

        if (isGemini3) {
          // Gemini 3 models use thinking levels (MINIMAL/LOW/MEDIUM/HIGH)
          thinkingConfig.thinkingLevel = THINKING_LEVEL_MAP[effort];
        } else {
          // Gemini 2.5 models use thinking budgets (token counts)
          const budgets: Record<string, number> = {
            minimal: 128,
            low: 2048,
            medium: 8192,
            high: model.apiId.includes("2.5-pro") ? 32768 : 24576,
          };
          thinkingConfig.thinkingBudget = budgets[effort] ?? 8192;
        }

        config.thinkingConfig = thinkingConfig;
      }

      // Pass abort signal to SDK for in-flight cancellation
      if (options?.signal) {
        if (options.signal.aborted) {
          throw new Error("Request aborted");
        }
        config.abortSignal = options.signal;
      }

      stream.push({ type: "start", partial: output });

      // Start streaming
      const response = await client.models.generateContentStream({
        model: model.apiId,
        contents,
        config,
      });

      // Track current content block for thinking/text transitions
      let currentBlock: any = null;
      let currentBlockType: "text" | "thinking" | null = null;

      for await (const chunk of response) {
        const candidate = chunk.candidates?.[0];

        // Process individual parts (handles thinking vs text detection)
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text !== undefined) {
              const isThinking = part.thought === true;
              const targetType = isThinking ? "thinking" : "text";

              // Check if we need to transition to a new block
              if (currentBlockType !== targetType) {
                // End previous block
                if (currentBlock && currentBlockType) {
                  if (currentBlockType === "text") {
                    stream.push({ type: "text_end", contentIndex: output.content.length - 1, content: currentBlock.text, partial: output });
                  } else {
                    stream.push({ type: "thinking_end", contentIndex: output.content.length - 1, content: currentBlock.thinking, partial: output });
                  }
                }

                // Start new block
                if (isThinking) {
                  currentBlock = { type: "thinking", thinking: "", thinkingSignature: undefined };
                  output.content.push(currentBlock);
                  stream.push({ type: "thinking_start", contentIndex: output.content.length - 1, partial: output });
                } else {
                  currentBlock = { type: "text", text: "", textSignature: undefined };
                  output.content.push(currentBlock);
                  stream.push({ type: "text_start", contentIndex: output.content.length - 1, partial: output });
                }
                currentBlockType = targetType;
              }

              // Accumulate content
              if (currentBlockType === "thinking") {
                currentBlock.thinking += part.text;
                currentBlock.thinkingSignature = retainThoughtSignature(currentBlock.thinkingSignature, part.thoughtSignature);
                stream.push({ type: "thinking_delta", contentIndex: output.content.length - 1, delta: part.text, partial: output });
              } else {
                currentBlock.text += part.text;
                currentBlock.textSignature = retainThoughtSignature(currentBlock.textSignature, part.thoughtSignature);
                stream.push({ type: "text_delta", contentIndex: output.content.length - 1, delta: part.text, partial: output });
              }
            }

            if (part.functionCall) {
              // End current text/thinking block before tool call
              if (currentBlock && currentBlockType) {
                if (currentBlockType === "text") {
                  stream.push({ type: "text_end", contentIndex: output.content.length - 1, content: currentBlock.text, partial: output });
                } else {
                  stream.push({ type: "thinking_end", contentIndex: output.content.length - 1, content: currentBlock.thinking, partial: output });
                }
                currentBlock = null;
                currentBlockType = null;
              }

              // Generate unique tool call ID with dedup (matches pi-mono pattern)
              const providedId = part.functionCall.id;
              const needsNewId =
                !providedId || output.content.some((b: any) => b.type === "toolCall" && b.id === providedId);
              const toolCallId = needsNewId
                ? `${part.functionCall.name}_${Date.now()}_${++toolCallCounter}`
                : providedId;

              const toolCall = {
                type: "toolCall" as const,
                id: toolCallId,
                name: part.functionCall.name || "",
                arguments: (part.functionCall.args as Record<string, any>) ?? {},
                ...(part.thoughtSignature && { thoughtSignature: part.thoughtSignature }),
              };

              output.content.push(toolCall);
              const idx = output.content.length - 1;
              stream.push({ type: "toolcall_start", contentIndex: idx, partial: output });
              stream.push({ type: "toolcall_delta", contentIndex: idx, delta: JSON.stringify(toolCall.arguments), partial: output });
              stream.push({ type: "toolcall_end", contentIndex: idx, toolCall, partial: output });
            }
          }
        }

        // Handle finish reason
        if (candidate?.finishReason) {
          output.stopReason = mapGeminiStopReason(candidate.finishReason);
          if (candidate.finishReason === FinishReason.SAFETY) {
            output.errorMessage = "Content blocked by safety filters";
          }
          // Override to toolUse if any tool calls are present (matches pi-mono)
          if (output.content.some((b: any) => b.type === "toolCall")) {
            output.stopReason = "toolUse";
          }
        }

        // Update usage — include thoughtsTokenCount in output (matches pi-mono)
        if (chunk.usageMetadata) {
          const meta = chunk.usageMetadata as any;
          output.usage = {
            input: meta.promptTokenCount || 0,
            output: (meta.candidatesTokenCount || 0) + (meta.thoughtsTokenCount || 0),
            cacheRead: meta.cachedContentTokenCount || 0,
            cacheWrite: 0,
            totalTokens: meta.totalTokenCount || 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          };
          calculateCost(model.cost.input, model.cost.output, model.cost.cacheRead, model.cost.cacheWrite, output.usage);
        }
      }

      // End final block
      if (currentBlock && currentBlockType) {
        if (currentBlockType === "text") {
          stream.push({ type: "text_end", contentIndex: output.content.length - 1, content: currentBlock.text, partial: output });
        } else {
          stream.push({ type: "thinking_end", contentIndex: output.content.length - 1, content: currentBlock.thinking, partial: output });
        }
      }

      stream.push({ type: "done", reason: output.stopReason as any, message: output });
      stream.end();
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  })();

  return stream;
}
