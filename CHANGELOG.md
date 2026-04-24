# Changelog

All notable changes to Claude Code will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial public release of Claude Code
- Multi-provider AI support (Anthropic Claude, OpenAI GPT, Google Gemini)
- CLI TUI interface built with Ink
- Web interface built with Next.js
- 40+ built-in tools (Git, file ops, web search, MCP, LSP)
- Agent and plugin system
- Session management and teleport
- Cost tracking and analytics
- `/provider` command for switching AI providers
- `/model` command with cross-provider model selection

### Changed
- Unified provider abstraction layer

## [1.0.0] - 2025-04-24

### Added
- First stable release
- Full multi-provider AI support (Anthropic, OpenAI, Google)
- Terminal-based REPL
- Context-aware file operations
- MCP (Model Context Protocol) server support
- Provider switching via `/provider` command
- Cross-provider model selection via `/model`
- Unified cost estimation across all providers

[Unreleased]: https://github.com/your-org/claude-code/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/claude-code/releases/tag/v1.0.0
