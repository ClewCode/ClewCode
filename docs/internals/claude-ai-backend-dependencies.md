# Systems That Depend on the claude.ai / Anthropic Backend

Audit of the clewcode (claudecode) codebase: subsystems that hardcode the
claude.ai OAuth / CCR (Claude Code Remote) backend and therefore **do not
work when the user is signed in with a non-Anthropic provider** (OpenAI,
Google, DeepSeek, OpenRouter, xAI, Mistral, Groq, Ollama, etc.).

A subsystem is considered claude.ai-bound if it requires:

- the `getClaudeAIOAuthTokens()` access token, **or**
- the `isClaudeAISubscriber()` / `hasProfileScope()` account state, **or**
- a direct HTTP call to a `claude.ai` / `api.claude.ai` / `cse_*` / `session_*`
  endpoint, **or**
- the `BRIDGE_MODE` build flag plus a GrowthBook gate.

Everything else (core query loop, most tools, commands, agents, plugins,
skills, memory) routes through `ProviderManager` and works with any
configured provider.

---

## 1. Authentication and account

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| OAuth login | `src/services/oauth/client.ts`, `src/commands/login/login.tsx`, `src/commands/logout/logout.tsx` | `claude auth login` opens a browser to `claude.ai/oauth/authorize`; tokens are stored against `oauthAccount` |
| Auth core | `src/utils/auth.ts` | Exports `getClaudeAIOAuthTokens`, `isClaudeAISubscriber`, `hasProfileScope`, `getOauthAccountInfo` — all read from the claude.ai OAuth keychain |
| API-key verification | `src/hooks/useApiKeyVerification.ts` | POSTs the key to `api.anthropic.com/v1/messages` to confirm it is live |

**Provider-agnostic path available:** the LLM call itself routes through
`ProviderManager`. Auth-only checks (do we have a key for provider X?) are
the bound part; the actual generation is fine.

---

## 2. Bridge / Remote Control (CCR)

Two parallel systems:

### 2a. Legacy CCR bridge (claude.ai-bound)

~30 files in `src/bridge/` — the original Claude Code Remote, tied to
claude.ai OAuth.

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| Bridge main loop | `src/bridge/bridgeMain.ts` | WebSocket dialer to `wss://…claude.ai`, spawns workers, requires OAuth token |
| Entitlement gate | `src/bridge/bridgeEnabled.ts` | `feature('BRIDGE_MODE')` + `isClaudeAISubscriber()` + GrowthBook `tengu_ccr_bridge`; emits a specific error if any check fails |
| Remote core | `src/bridge/remoteBridgeCore.ts`, `src/bridge/replBridge.ts`, `src/bridge/replBridgeHandle.ts`, `src/bridge/replBridgeTransport.ts` | Long-lived socket for forwarding events between local session and claude.ai |
| API client | `src/bridge/bridgeApi.ts`, `src/bridge/codeSessionApi.ts`, `src/bridge/bridgeConfig.ts` | Hit `BASE_API_URL` (claude.ai) with bearer token; includes 403 suppression for bridge-specific errors |
| Auth/secret handshake | `src/bridge/workSecret.ts`, `src/bridge/trustedDevice.ts`, `src/bridge/jwtUtils.ts` | Decode worker secrets signed by claude.ai; cache trusted device tokens |
| Session spawning | `src/bridge/sessionRunner.ts`, `src/bridge/createSession.ts`, `src/bridge/types.ts` | Spawn sessions in claude.ai-hosted workers |
| Session ID compat | `src/bridge/sessionIdCompat.ts` | `cse_*` ↔ `session_*` shim against the claude.ai frontend |
| Init paths | `src/bridge/initReplBridge.ts`, `src/bridge/envLessBridgeConfig.ts`, `src/bridge/replBridge.ts` | v1 (env) and v2 (env-less) startup paths |
| UI | `src/components/BridgeDialog.tsx`, `src/hooks/useReplBridge.tsx` | Renders the "share to claude.ai" affordance |
| Command | `src/commands/bridge/bridge.tsx` | `/bridge` slash command |
| SDK transports | `src/cli/transports/ccrClient.ts`, `WebSocketTransport.ts`, `SSETransport.ts`, `HybridTransport.ts`, `transportUtils.ts` | Wire format the headless SDK uses to talk to CCR |
| Background remote | `src/utils/background/remote/preconditions.ts`, `src/utils/background/remote/remoteSession.ts` | Background reconnection, polling, alive checks |

### 2b. Bridge v2 — provider-agnostic Remote Control (clewcode fork)

New standalone system in `src/remote/` that works without claude.ai.
Runs a local WebSocket server with one-time auth tokens, session
management, and an optional relay for NAT traversal.

| Subsystem | Key files | Description |
| --- | --- | --- |
| Server | `src/remote/RemoteServer.ts` | WebSocket server with HTTP health/metrics API |
| Auth | `src/remote/tokenStore.ts` | SHA-256 hashed one-time token generation and validation |
| Relay | `src/remote/RelayClient.ts` | Optional NAT-traversal relay mode |
| Types | `src/remote/types.ts` | Shared types for the v2 protocol |
| Command | `src/commands/remote/remote.ts`, `src/commands/remote/index.ts` | `/remote listen|connect|token` |
| UI | `src/hooks/useRemoteBridge.tsx`, `src/components/RemoteServerStatus.tsx` | Session bridge hook + connection status component |
| Tests | `src/remote/RemoteServer.test.ts` | 5 tests: health, auth, session lifecycle |

---

## 3. MCP — claude.ai Connectors

User-installed MCP servers (Gmail, Calendar, Notion, etc.) are
provisioned through the claude.ai web UI and addressed by
`/v1/mcp/connectors/...` on the claude.ai backend.

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| Connector client | `src/services/mcp/claudeai.ts` | Lists and connects MCP servers known to the user's claude.ai account |
| Channel notifications | `src/services/mcp/channelNotification.ts` | Channel-based message routing via claude.ai |
| Settings UI | `src/components/mcp/MCPSettings.tsx`, `src/components/mcp/MCPRemoteServerMenu.tsx` | Toggles claude.ai-managed servers |
| Discovery/normalization | `src/services/mcp/normalize.ts`, `src/services/mcp/config.ts`, `src/services/mcp/client.ts`, `src/services/mcp/useManageMCPConnections.ts` | Treat the claude.ai connector list as one of the MCP sources |
| Utility | `src/services/mcp/utils.ts` | Shared helpers; some paths assume OAuth token presence |

**Provider-agnostic path available:** standard MCP servers configured
locally in `~/.claude.json` or `.mcp.json` work fine. The bound part is
the **claude.ai-hosted** connector directory.

---

## 4. Claude-in-Chrome Extension

The official browser-automation extension talks back to a claude.ai
control plane for install telemetry, deep-link handoff, and an
extension-managed MCP server.

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| Onboarding | `src/components/ClaudeInChromeOnboarding.tsx` | Wizard assumes claude.ai login |
| Install command | `src/commands/chrome/chrome.tsx` | `claude chrome install` flow |
| Portable setup | `src/utils/claudeInChrome/setupPortable.ts` | Bundles the extension |
| MCP server | `src/utils/claudeInChrome/mcpServer.ts` | Exposes Chrome tools; tied to extension auth |
| Notification hook | `src/hooks/useChromeExtensionNotification.tsx` | Surfaces extension events to the TUI |

---

## 5. Teleport / Desktop Handoff

Move a running session between machines via a claude.ai-mediated
relay.

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| Teleport core | `src/utils/teleport.tsx`, `src/utils/teleport/api.ts`, `src/utils/teleport/gitBundle.ts`, `src/utils/teleport/environments.ts` | Encodes session state, POSTs to claude.ai, decodes on the other side |
| Setup command | `src/commands/remote-setup/api.ts` | `/remote-setup` |
| Env command | `src/commands/remote-env/index.ts` | `/remote-env` |
| UI | `src/components/DesktopHandoff.tsx` | Pairing screen |

---

## 6. Remote Agents / Tasks

Spin work off to a claude.ai-hosted worker instead of running locally.

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| Task type | `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx` | Lifecycle of a remote-task entry |
| Tool | `src/tools/RemoteTriggerTool/RemoteTriggerTool.ts`, `src/tools/RemoteTriggerTool/prompt.ts` | LLM-callable tool to trigger a remote job |
| Skill | `src/skills/bundled/scheduleRemoteAgents.ts` | Bundled skill for scheduled remote runs |
| Spawning | `src/utils/swarm/spawnUtils.ts` | Worker spawn helper |

---

## 7. Subscription, billing, and quotas

Anything that displays "you have N requests left" or "upgrade to Pro" is
talking to claude.ai's entitlements API.

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| Limits | `src/services/claudeAiLimits.ts` | Per-user, per-model rate-limit numbers |
| Quota | `src/services/api/ultrareviewQuota.ts`, `src/commands/review/ultrareviewCommand.tsx` | Ultrareview credit balance |
| Extra usage | `src/utils/extraUsage.ts` | Overage toggle state |
| Billing | `src/utils/billing.ts` | Subscription tier, payment method display |
| Rate-limit UI | `src/components/messages/RateLimitMessage.tsx`, `src/commands/rate-limit-options/index.ts` | Renders claude.ai-shaped limit messages |
| Upgrade | `src/commands/upgrade/upgrade.tsx` | Links to claude.ai/upgrade |
| Cost | `src/commands/cost/cost.ts`, `src/commands/cost/index.ts` | Pulls usage from claude.ai billing |
| Switch-subscription hook | `src/hooks/notifs/useCanSwitchToExistingSubscription.tsx` | Tells the UI whether to show the "switch plan" banner |

---

## 8. Settings / policy sync

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| User settings sync | `src/services/settingsSync/index.ts` | `theme`, `notifChannels`, etc. mirrored to claude.ai |
| Managed settings | `src/services/remoteManagedSettings/index.ts`, `src/services/remoteManagedSettings/syncCache.ts` | Org admin policies (allowed tools, blocked commands) |
| Team memory | `src/services/teamMemorySync/index.ts` | Shared memdir scoped to a workspace |
| Policy limits | `src/services/policyLimits/index.ts` | Org-level rate caps |

---

## 9. Voice input

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| STT streaming | `src/services/voiceStreamSTT.ts` | Streams audio to a claude.ai WebSocket for transcription |
| Mode gate | `src/voice/voiceModeEnabled.ts`, `src/hooks/useVoiceEnabled.ts` | Checks subscription before exposing the mic button |

---

## 10. Reviews and PR automations

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| Review (remote) | `src/commands/review/reviewRemote.ts` | Off-host review of a PR |
| Ultrareview | `src/commands/review/ultrareviewCommand.tsx`, `src/services/api/ultrareviewQuota.ts` | Heavy async review job with quota |
| Autofix PR | `src/commands/autofix-pr/autofixPr.ts` | Opens a remediation PR on a remote worker |
| Git helpers | `src/utils/git.ts`, `src/utils/gitDiff.ts` | Some code paths push to claude.ai endpoints (PR preview, comment posting) |

---

## 11. Fast mode / model capabilities

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| Fast mode | `src/utils/fastMode.ts` | "turbo" preference stored on claude.ai side |
| 1M context gate | `src/utils/model/check1mAccess.ts` | Per-user entitlement check |
| Capabilities | `src/utils/model/modelCapabilities.ts`, `src/utils/model/modelOptions.ts` | Some flags only resolve for claude.ai-issued tokens |
| Beta flags | `src/utils/betas.ts` | Reads user's claude.ai beta opt-ins |

---

## 12. Telemetry and analytics

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| BigQuery export | `src/utils/telemetry/bigqueryExporter.ts` | Forwards events to Anthropic's first-party tables |
| First-party event log | `src/services/analytics/firstPartyEventLoggingExporter.ts` | Hardcoded endpoint |
| Metrics opt-out | `src/services/api/metricsOptOut.ts` | Reads the per-user telemetry preference from claude.ai |
| Referral | `src/services/api/referral.ts` | Referral credit API on claude.ai |
| Auth check | `src/services/api/claude.ts`, `src/services/api/withRetry.ts`, `src/services/api/usage.ts`, `src/services/api/errors.ts`, `src/services/api/anthropicClient.ts`, `src/services/api/bootstrap.ts` | `getClaudeAIOAuthTokens()` callers |
| API base | `src/constants/oauth.ts` | Defines `BASE_API_URL` (claude.ai) and OAuth client ID |

---

## 13. Notices and supporting UI

| Subsystem | Key files | Why it is bound |
| --- | --- | --- |
| Channels notice | `src/components/LogoV2/ChannelsNotice.tsx` | Subscription-channel cross-promo |
| Status notices | `src/utils/statusNoticeDefinitions.tsx`, `src/utils/status.tsx` | Some notices render only for claude.ai subscribers |
| Logo V2 utils | `src/utils/logoV2Utils.ts` | Feature flag for claude.ai-only logo |
| `useApiKeyVerification` | `src/hooks/useApiKeyVerification.ts` | Verifies Anthropic API key shape |

---

## Provider-agnostic systems (for contrast)

These are the major surfaces that **do** work with any provider:

- `src/query.ts`, `src/QueryEngine.ts` — message building, tool loop
- `src/services/ai/ProviderManager.ts`, `src/services/ai/providerRegistry.ts`,
  `src/services/ai/providers.json`, `src/services/ai/adapter/*` — provider
  routing and adapters
- `src/services/ai/contentBlockUtils.ts`, `toolCallParser.ts`,
  `errorNormalizer.ts`, `usageNormalizer.ts` — cross-provider normalization
- All built-in tools in `src/tools/` that do not call claude.ai
  (Bash, FileEdit, FileRead, Grep, Glob, WebFetch, WebSearch via
  provider-agnostic providers, ExitPlanMode, etc.)
- `src/services/tools/`, `src/services/tools/StreamingToolExecutor.ts` —
  tool execution pipeline
- `src/commands/` slash commands that do not call bridge/MCP-connector
  endpoints
- `src/agentRuntime/`, `src/services/autonomous/`, `src/coordinator/` —
  agent and task infrastructure
- `src/plugins/`, `src/skills/` — plugin and skill systems
- `src/memdir/`, `src/research/` — local memory and research
- `src/services/Supervisor/`, `src/services/SessionLifecycle/`,
  `src/services/SessionMemory/` — session and supervision
- `src/services/lsp/` — language server integration
- `src/voice/sherpa-onnx-tts`, local TTS paths
- `src/upstreamproxy/`, `src/services/api/` pure HTTP helpers
- `src/state/`, `src/screens/`, `src/components/` — generic TUI

---

## Implications for the fork

If the goal of the clewcode fork is to be a **truly multi-provider
coding agent**, the following are the load-bearing claude.ai dependencies
that need a strategy (stub, replace, or accept the limitation):

1. **CCR bridge** (`src/bridge/`, `src/remote/`, `src/cli/transports/*`)
   — by far the largest single bound surface. Either re-target at a
   self-hosted relay or accept it as claude.ai-only.
2. **MCP claude.ai connectors** (`src/services/mcp/claudeai.ts`,
   related UI) — separate from local MCP, this is the user's claude.ai
   connector directory.
3. **OAuth login** (`src/services/oauth/client.ts`) — the entry point
   to everything above. A non-Anthropic provider login leaves the entire
   bound surface off-limits.
4. **Subscription / billing / quota** displays — pure UI; trivial to
   guard, but the data sources are claude.ai-only.
5. **Claude-in-Chrome extension** — a bundled extension tightly coupled
   to claude.ai auth.
6. **Teleport, autofix PR, ultrareview, remote agents** — feature
   groups that depend on CCR workers.

Everything outside the list above should already work with the configured
provider through `ProviderManager`.
