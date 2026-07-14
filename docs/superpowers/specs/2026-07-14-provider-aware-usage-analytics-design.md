# Provider-Aware Usage Analytics Design

## Goal

Make `/usage` match the information density of the Anthropic reference UI while preserving the provider-aware quota work already in progress.

## Scope

The Usage tab shows two independent data sources:

1. Local analytics for every provider, derived from session JSONL files on this machine.
2. Remote quota windows where supported: Claude AI OAuth usage for Anthropic subscribers and captured Codex limits for ChatGPT subscribers.

Unsupported providers still receive local analytics and an explicit message that remote usage limits are unavailable.

## Local analytics

The top `Session` section reports values that can be derived reliably from local records:

- total estimated cost
- API duration and wall duration
- lines added and removed
- per-model input, output, cache-read, cache-creation, and estimated cost

The contributing-factors section covers the rolling 24 hours ending when `/usage` loads. It identifies high-context usage and attributes tool usage to skills, plugins, and MCP servers only when the transcript contains direct evidence. Empty attribution groups are omitted rather than shown as zero.

All local-analysis copy states that values are approximate, machine-local, and exclude other devices and claude.ai.

## Data boundaries

A focused service reads session JSONL records and returns a UI-oriented `LocalUsageAnalytics` value. Parsing is defensive: malformed lines and unknown message variants are skipped, while readable records continue contributing. The service reuses the session discovery and model-usage conventions already established in `src/utils/stats.ts`; it does not introduce telemetry or a second persistent database.

The current session summary is separated from the rolling 24-hour contribution window. Percentages use token contribution as their denominator and are omitted when no denominator exists.

## UI and failure behavior

`Usage.tsx` loads local analytics and remote utilization independently. A failure in one source does not hide the other. Remote 429 handling and stale-cache behavior remain unchanged. The layout order is:

1. Session summary
2. Provider quota bars and extra usage
3. Local contributing factors
4. Existing overage-credit content and keyboard hint

The existing Codex files and provider switching behavior remain intact.

## Testing

Unit tests cover rolling-window boundaries, malformed JSONL, model aggregation, diff counts, attribution classification, high-context detection, percentages, and omitted empty groups. Component coverage verifies Anthropic, ChatGPT, unsupported providers, and partial-source failures. The final gate is `bun run check:ci && bun x tsc --noEmit && bun test --bail` plus the project shadow-pair check and a real `/usage` smoke test.

## Documentation

Update `AGENT.md` and `CHANGELOG.md` under `[Unreleased]` in the same change. Do not modify `dist/`.
