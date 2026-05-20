const fs = require('fs');

const content = fs.readFileSync('src/services/ai/providerRegistry.ts', 'utf8');

const prefix = content.slice(0, content.indexOf('export const PROVIDER_REGISTRY = {'));
const suffixIndex = content.indexOf('export const PROVIDER_IDS = Object.keys(PROVIDER_REGISTRY)');
const suffix = content.slice(suffixIndex);

const newContent = prefix + `import providersConfig from './providers.json'

function createProvider(key: string, entry: any): ProviderInterface {
  switch (key) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai': return new OpenAIProvider();
    case 'google': return new GoogleProvider();
    case 'copilot': return new CopilotProvider();
    case 'openrouter': return new OpenRouterProvider();
    case 'deepseek': return new OpenAIProvider();
    case 'kilocode': return new KiloCodeProvider();
    case 'chatgpt': return new ChatGPTSessionProvider();
    case 'ollama': return new OllamaProvider();
    default:
      if (entry.envKey && entry.defaultBaseUrl) {
        return new OpenAICompatibleProvider(
          entry.providerId,
          entry.label,
          entry.envKey,
          entry.defaultBaseUrl
        );
      }
      throw new Error(\`Unknown provider class for \${key}\`);
  }
}

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderRegistryEntry> = Object.fromEntries(
  Object.entries(providersConfig).map(([key, config]) => [
    key,
    { ...(config as any), provider: createProvider(key, config) }
  ])
) as any;

` + suffix;

// Also need to add the import to the top of the file
const finalContent = newContent.replace(
  "import type { ProviderId, ProviderInterface } from './providers/ProviderInterface.js'",
  "import type { ProviderId, ProviderInterface } from './providers/ProviderInterface.js'"
); // Actually it's already added at the end of prefix block.

fs.writeFileSync('src/services/ai/providerRegistry.ts', finalContent);
console.log('Successfully updated providerRegistry.ts');
