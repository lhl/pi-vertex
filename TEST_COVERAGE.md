# Test Coverage

## Current Status
- **Automated tests**: ✅ Unit tests for `auth`, `config`, `utils`, and `models`.
- **Lint/type checks**: Biome + TypeScript (`npm run check`, `npm run build`).
- **CI**: GitHub Actions runs `build`, `check`, and `test:coverage` on every PR and push to `main`.

## Test Files
| File | Coverage |
|------|----------|
| `tests/utils.test.ts` | `sanitizeText`, `retainThoughtSignature`, `mapStopReason`, `calculateCost`, `convertTools`, `convertToolsForGemini` |
| `tests/auth.test.ts` | `resolveProjectId`, `resolveLocation`, `hasAdcCredentials`, `getAuthConfig`, `buildBaseUrl` |
| `tests/config.test.ts` | `getConfigPath`, `loadConfig` (with mocked FS) |
| `tests/models.test.ts` | Model definitions integrity, uniqueness, field validation |
| `tests/convert-to-gemini.test.ts` | `convertToGeminiMessages` — user text/images, assistant text/thinking/tool calls, tool results, cross-provider signatures, multi-turn conversations |
| `tests/streaming-dispatch.test.ts` | `streamVertex` endpoint type dispatch (gemini/maas routing, error on unknown type) |

## Gaps / Next Steps
- Add integration tests for `streaming/gemini.ts` (requires mocking `@google/genai` `generateContentStream`).
- Add integration tests for `streaming/maas.ts` (requires mocking `@anthropic-ai/vertex-sdk` and OpenAI-compatible path).
- Add tests for `index.ts` extension entry point (requires mocking `pi-coding-agent` ExtensionAPI).
