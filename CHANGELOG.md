# Changelog

All notable changes to this project will be documented in this file.

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
