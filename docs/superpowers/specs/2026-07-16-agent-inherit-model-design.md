# Agent Tool Model Inheritance Design

## Goal

Allow `Agent` tool callers to explicitly run a subagent with the current session's provider and exact model by passing `model: "inherit"`.

## Behavior

- Extend the Agent tool's `model` input from `sonnet | opus | haiku` to `sonnet | opus | haiku | inherit`.
- `model: "inherit"` selects `toolUseContext.options.mainLoopModel` exactly.
- Explicit inheritance takes precedence over the agent definition's model frontmatter and the global `subagentModel` setting.
- Omitting `model` preserves current behavior: global subagent setting, then agent frontmatter, then parent model fallback.
- Provider routing remains unchanged and continues to use the active session provider. No `provider` field is added to the Agent tool.

## Implementation

Represent the Agent tool override with the existing provider-aware `AgentModelAlias` type. Teach `getAgentModel()` to return the parent model immediately when the tool override is `inherit`; keep all existing alias resolution unchanged.

The ChatGPT failure is a separate adapter defect exposed by subagent execution: ChatGPT Responses requests currently forward `temperature`, but the subscription endpoint rejects it. Stop adding `temperature` in `ChatGPTProvider.convertToResponses()`; no retry or provider-specific abstraction is needed.

## Compatibility

Existing Agent calls and agent frontmatter behave unchanged. Existing `sonnet`, `opus`, and `haiku` overrides retain their provider-aware alias resolution. The new value is additive.

## Tests

- Agent input schema accepts `model: "inherit"`.
- `getAgentModel()` returns the exact parent model for an explicit `inherit`, even when agent frontmatter or `subagentModel` specifies another model.
- ChatGPT Responses request serialization omits `temperature`.
- Existing model-resolution and ChatGPT provider tests remain green.

## Documentation

Update the Agent tool description/docs and `CHANGELOG.md` under `[Unreleased]` in the same change.
