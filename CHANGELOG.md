# Changelog

All notable changes to this project will be documented in this file.

## [1.1.6] - 2026-05-05
### Added
- Comprehensive unit tests for `convertToGeminiMessages` (27 test cases covering user text, images, assistant text/thinking/tool calls, tool results, cross-provider signatures, and multi-turn conversations).
- Unit tests for `streamVertex` dispatch logic (gemini vs maas routing, unknown endpoint type errors).
### Fixed
- `streamAnthropic()` now calls `stream.end()` internally instead of relying on the caller, preventing potential stream hangs on early returns or mid-stream errors.
- Removed hardcoded `maxTokens / 2` halving in `streaming/gemini.ts` and `streaming/maas.ts`. Models now use their full advertised output capacity unless explicitly overridden via `options.maxTokens`.

## [1.1.5] - 2026-05-05
### Changed
- Forked to `lhl/pi-vertex` with standalone repository, CI, tests, and linting.
- Renamed package to `@lhl/pi-vertex`.
- Added Biome for linting and formatting.
- Added Vitest with coverage for unit tests (auth, config, utils, models).
- Added GitHub Actions CI workflow for type-check, lint, and test.
- Replaced placeholder `npm run check/build/clean` scripts with real implementations.

## [1.1.4] - 2026-03-30
### Fixed
- Removed error message override for `400 (no body)` responses from Vertex MaaS models. The original message now passes through to `isContextOverflow()` which already handles this pattern, enabling proper auto-compact instead of showing a raw error to the user.
- Use `zai` thinking format for `zai-org` publisher models (GLM-5). Previously using `openai` format which never sent `enable_thinking`, causing intermittent 400 errors from the ZAI API.

## [1.1.3] - 2026-03-26
### Fixed
- Hardened Claude-on-Vertex replay for mid-session model switching (tool ID normalization, tool result adjacency, thinking signature validation).
- Prevented Anthropic tool replay errors by inserting synthetic tool results when missing.

### Updated
- Claude 4.6 models use native Anthropic Vertex SDK streaming.
- Claude 4.6 context window updated to 1M.
- Model list order in the selector is now alphabetized by ID.

## [1.1.2] - 2026-03-24
### Changed
- Initial Claude 4.x support on Vertex.
