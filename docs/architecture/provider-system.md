# Provider System

How Clew Code selects, scopes, configures, and calls AI providers.

## Architecture

```text
REPL / agents / background work
        |
        v
ProviderManager + ScopedProviderContext
        |
        +--> providerRegistry.ts <- providers.json (catalog / defaults / capabilities)
        |
        +--> provider implementation
              |-- Anthropic native path
              |-- OpenAIProvider (OpenAI + Azure OpenAI)
              |-- GoogleProvider (Gemini API-key endpoint)
              `-- OpenAICompatibleProvider / dedicated adapters
        |
        v
AnthropicAdapter / provider-specific protocol edge
        |
        v
Clew Internal Protocol v1
```

The core uses the Anthropic Messages-shaped **Clew Internal Protocol v1**. Providers with different wire formats are converted at the provider boundary. Changing the internal request/message/stream shapes is a protocol change, not a provider-local refactor.

## Single source of truth

`src/services/ai/providers.json` is the provider/model catalog. It supplies provider IDs, labels, API-key env vars, base/model-list URLs, default models, capabilities, and prompt-cache metadata through `providerRegistry.ts`.

Do not create another static provider list. A provider that needs custom runtime behavior gets a dedicated implementation registered by `providerRegistry.ts`; ordinary OpenAI-compatible providers should stay registry-driven.

Live `/models` responses are normalized by `providerModels.ts` and cached. The registry remains the offline/failure fallback.

## Scope and precedence

There are three different concepts and they must not be conflated:

1. **Execution scope** — subagents/background work can pass `ScopedProviderContext`; this is the strongest request-local override and does not mutate shared process state.
2. **Interactive session selection** — `/providers` and `/model` use AppState session fields plus `ProviderManager.setSessionProviderConfig()` for provider-specific metadata. Session-only selection must not rewrite shared `provider.json`.
3. **Global default** — explicit `--global` / **Save as global default** writes `provider.json` for future sessions.

Provider resolution then falls back through `AI_PROVIDER`, the effective project/global `provider.json`, legacy Anthropic backend flags, and finally `DEFAULT_PROVIDER`.

`ProviderManager.setSessionProvider()` / `setSessionModel()` are legacy process-global overrides. Do not use them from new interactive UI paths because they can leak across in-process agents and background work.

### Provider config files

The effective file is:

- `<project>/.clew/provider.json` when that file already exists; otherwise
- `~/.clew/provider.json` (or `CLEW_CONFIG_DIR/provider.json`).

A session-only selection keeps its provider/model/providerConfig in memory. API keys entered for the current session are applied immediately through the session key overlay; they are persisted only for an explicit global save.

## API keys versus provider metadata

Credential fields and endpoint/config fields are different contracts:

- `apiKeys.<provider>` stores credentials only.
- `providerConfig` stores provider metadata such as `openaiType` and Azure `baseUrl`.
- Never store endpoint URLs, project IDs, or other routing metadata in `apiKeys`.

This distinction matters for auth headers and for session/global isolation.

## OpenAI

Direct OpenAI uses `OPENAI_API_KEY` and optionally `OPENAI_BASE_URL`.

### Azure OpenAI

Choose **Azure OpenAI** in `/providers`. The picker collects the endpoint separately from the API key. The runtime accepts:

| Variable | Purpose |
| --- | --- |
| `AZURE_OPENAI_API_KEY` | Preferred Azure OpenAI credential |
| `AZURE_API_KEY` | Legacy compatibility fallback |
| `OPENAI_API_KEY` | Final compatibility fallback |
| `AZURE_OPENAI_ENDPOINT` | Azure endpoint, e.g. `https://resource.openai.azure.com/` |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name; selected model is the fallback |
| `AZURE_OPENAI_API_VERSION` | API version override |

For picker-created config, `providerConfig.openaiType` is `azure` and the endpoint is stored as `providerConfig.baseUrl`. It is never stored as the OpenAI API key.

Azure model enumeration is intentionally not treated like the public OpenAI `/models` endpoint; deployments are Azure-resource-specific.

## Google

The `google` provider is the Gemini API-key path and uses `GOOGLE_API_KEY` against the Google Generative Language OpenAI-compatible endpoint.

The old **Google Vertex AI** entry was removed from the generic provider picker because `GoogleProvider` did not consume its project-ID/Vertex settings; presenting it as a working choice created invalid configuration. Anthropic-on-Vertex remains a separate Anthropic backend path controlled by the existing Anthropic Vertex configuration/flags.

Gemini Code Assist OAuth is a separate `google-assist` provider and should not be mixed with the `google` API-key contract.

## Legacy IDs and migration

`normalizeProviderId()` maps historical aliases such as `gemini` to canonical provider IDs such as `google`. `normalizeLegacyProviderConfig()` performs an in-memory, non-destructive migration: canonical API-key entries are copied while legacy entries remain for downgrade compatibility.

Unknown provider IDs fall through selection precedence rather than crashing configuration load.

## Selection-time validation

`providerSelection.ts` validates explicit provider/model choices:

- the provider must resolve to a registry entry;
- a model should match the registry catalog or the provider's live model listing;
- when no model catalog can be obtained, an explicit model can be accepted as unverified;
- `custom` provider model IDs are intentionally arbitrary.

## Concurrency rule

Provider choice is execution context. New agent/background APIs should pass a `ScopedProviderContext` instead of mutating `ProviderManager` singleton selection. This keeps concurrent workers from changing one another's provider, model, endpoint, or API key.

## Verification checklist

When adding or changing a provider:

1. update `providers.json` rather than adding a second catalog;
2. keep credentials separate from endpoint/provider metadata;
3. verify session-only changes do not write global config;
4. verify `--global` writes exactly the intended value (flags must never become part of a key/model);
5. add model-list and selection regression tests;
6. run `bun run check:ci && bun x tsc --noEmit && bun test --bail`.
