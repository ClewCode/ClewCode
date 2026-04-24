# API Reference — Current Implementation

The current implementation uses Anthropic's Claude models as the primary AI provider through the official `@anthropic-ai/sdk` package.

## Current Architecture

The system directly uses Anthropic's SDK without a provider abstraction layer. The main API client is in `src/services/api/client.ts`.

### Message Types

```typescript
// Based on @anthropic-ai/sdk types

import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageStreamParams,
  BetaStopReason,
  BetaToolUnion,
  BetaToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  isDangerous?: boolean;
  permissions?: string[];
}
```

### API Client

The main client function creates an Anthropic SDK instance:

```typescript
// src/services/api/client.ts

import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk';

export async function getAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string;
  maxRetries: number;
  model?: string;
  fetchOverride?: ClientOptions['fetch'];
  source?: string;
}): Promise<Anthropic> {
  // Returns Anthropic SDK client
  // Supports: Direct API, AWS Bedrock, Azure Foundry, Google Vertex AI
}
```

### Supported Deployment Options

The Anthropic client supports multiple deployment options through environment variables:

#### Direct API (Default)
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

#### AWS Bedrock
```bash
export CLAUDE_CODE_USE_BEDROCK=true
# Uses AWS credentials from environment or ~/.aws/credentials
```

#### Azure Foundry (Azure OpenAI)
```bash
export CLAUDE_CODE_USE_FOUNDRY=true
export ANTHROPIC_FOUNDRY_RESOURCE="your-resource"
# Or: export ANTHROPIC_FOUNDRY_BASE_URL="https://your-resource.services.ai.azure.com"
# Authentication: ANTHROPIC_FOUNDRY_API_KEY or Azure AD
```

#### Google Vertex AI
```bash
export CLAUDE_CODE_USE_VERTEX=true
export ANTHROPIC_VERTEX_PROJECT_ID="your-gcp-project"
# Uses Google Application Default Credentials
```

### Provider Configuration (Future/Planned)

While the runtime currently only supports Anthropic, the CLI includes configuration for multiple providers:

```bash
# Configure provider and model
claude --provider openai --model gpt-4.1-mini
claude --provider anthropic --model claude-3-5-sonnet-20241022
```

Available providers in configuration:
- **OpenAI**: GPT-4, GPT-4.1, GPT-4.1-mini, GPT-4o-mini
- **Anthropic**: Claude Opus 4, Sonnet 4, Haiku
- **Google Gemini**: Gemini 2.5 Flash
- **OpenRouter**: 100+ models
- **Groq**: Llama 3.3, 3.1
- **xAI**: Grok 4, Grok 4-mini
- **Mistral**: Mistral Large
- **KiloCode**: KiloCode AI Gateway
- **OpenCode**: OpenCode AI Gateway
- **Ollama**: Local models

### Tool System

The system includes 40+ built-in tools that can be used by the AI:

```typescript
import { getTools } from './tools.js';

const tools = getTools(permissionContext);
// Returns: Array of Tool objects with execute methods
```

Available tools include:
- File operations (Read, Write, Edit)
- Shell execution (Bash, PowerShell)
- Search (Grep, Glob, WebSearch)
- Git operations
- Agent management
- MCP server integration
- And more...

### Multi-Provider Support (Planned)

The codebase includes infrastructure for future multi-provider support:

- Provider configuration system in `src/main.tsx`
- Model selection per provider
- Base URLs for different providers
- Environment variable keys for each provider

To enable full multi-provider support, a provider abstraction layer would need to be implemented to wrap different SDKs (OpenAI, Google, etc.) with a unified interface.

### Current Limitations

- Only Anthropic Claude models are actively supported at runtime
- Other providers (OpenAI, Google, etc.) are configured but not integrated
- All API requests go through Anthropic's API
- Multi-provider support requires additional implementation