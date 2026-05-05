# Test Coverage

## Current Status
- **Automated tests**: ✅ 88 tests across auth, config, utils, models, Gemini message conversion, streaming dispatch, mocked Gemini streaming, and mocked MaaS (Anthropic + OpenAI-compat) streaming.
- **Lint/type checks**: Biome + TypeScript (`npm run check`, `npm run build`). `npm run check` is clean (0 warnings).
- **CI**: GitHub Actions runs `build`, `check`, and `test:coverage` on every PR and push to `main`.

## Test Files
| File | Coverage |
|------|----------|
| `tests/utils.test.ts` | `sanitizeText`, `retainThoughtSignature`, `mapStopReason`, `calculateCost`, `convertTools`, `convertToolsForGemini` |
| `tests/auth.test.ts` | `resolveProjectId`, `resolveLocation`, `hasAdcCredentials`, `getAuthConfig`, `buildBaseUrl` |
| `tests/config.test.ts` | `getConfigPath`, `loadConfig` (with mocked FS) |
| `tests/models.test.ts` | Model definitions integrity, uniqueness, field validation |
| `tests/convert-to-gemini.test.ts` | `convertToGeminiMessages` — user text/images, assistant text/thinking/tool calls, tool results including images and missing-result synthesis, cross-provider signatures, multi-turn conversations |
| `tests/streaming-dispatch.test.ts` | `streamVertex` endpoint type dispatch (gemini/maas routing, error on unknown type) |
| `tests/streaming-gemini.test.ts` | `streamGemini` integration-style tests with mocked `@google/genai`: thinking config, cached-token usage, safety termination |
| `tests/streaming-maas.test.ts` | `streamMaaS` Anthropic path (happy path, tool_use stop reason, sync error path, exactly-one `stream.end()` regression test) and OpenAI-compat path (event relay + model id rewrite) |

## Gaps / Next Steps
- Add broader integration tests for `streaming/gemini.ts` event sequencing (text/thinking/tool-call chunks).
- Expand `streaming/maas.ts` Anthropic-path coverage: thinking blocks with signatures, multi-turn tool-result adjacency, tool-id sanitization edge cases.
- Add tests for `index.ts` extension entry point (requires mocking `pi-coding-agent` ExtensionAPI).
- Tighten the `any` usage in `streaming/maas.ts` (currently disabled via biome override) by introducing an internal type for the normalize/replay pipeline.
