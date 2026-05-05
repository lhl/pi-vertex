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

## Gaps / Next Steps
- Add integration tests for `streaming/gemini.ts` and `streaming/maas.ts` (requires mocking `@google/genai` and `@anthropic-ai/vertex-sdk`).
- Add tests for `index.ts` extension entry point (requires mocking `pi-coding-agent` APIs).
- Add tests for `convertToGeminiMessages` in `utils.ts` (complex message conversion logic).
