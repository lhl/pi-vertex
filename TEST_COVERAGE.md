# Test Coverage

## Current Status
- **Automated tests**: ✅ 86 tests across auth, config, utils, models, Gemini message conversion, streaming dispatch, and mocked Gemini streaming.
- **Lint/type checks**: Biome + TypeScript (`npm run check`, `npm run build`).
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

## Gaps / Next Steps
- Add broader integration tests for `streaming/gemini.ts` event sequencing (text/thinking/tool-call chunks).
- Add integration tests for `streaming/maas.ts` (requires mocking `@anthropic-ai/vertex-sdk` and OpenAI-compatible path).
- Add tests for `index.ts` extension entry point (requires mocking `pi-coding-agent` ExtensionAPI).
