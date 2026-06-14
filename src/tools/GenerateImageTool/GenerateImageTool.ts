import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PermissionResult } from 'src/utils/permissions/PermissionResult.js';
import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getGenerateImagePrompt, GENERATE_IMAGE_TOOL_NAME } from './prompt.js';
import { getToolUseSummary, renderToolUseMessage, renderToolResultMessage } from './UI.js';

type ImageGenConfig = { defaultModel: string; apiType: string };
type ProviderEntry = {
  capabilities?: { imageGen?: ImageGenConfig };
  envKey?: string;
  defaultBaseUrl?: string;
  modelsUrl?: string;
};

// Session cache: avoid re-querying provider APIs every call
let _discoveredProvider: { name: string; config: ImageGenConfig; apiKey: string } | null | undefined;

const IMAGE_GEN_DISCOVERY: Record<string, (baseUrl: string, apiKey: string) => Promise<string | null>> = {
  openai: async (baseUrl, apiKey) => {
    // OpenAI: /v1/models → find image-capable
    const resp = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { data?: Array<{ id: string }> };
    const imgModel = json.data?.find(m => m.id.startsWith('dall-e-'));
    return imgModel?.id ?? null;
  },
  openrouter: async (_baseUrl, apiKey) => {
    // OpenRouter: /models?output_modalities=image
    const resp = await fetch('https://openrouter.ai/api/v1/models?output_modalities=image', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { data?: Array<{ id: string }> };
    return json.data?.[0]?.id ?? null;
  },
  google: async (baseUrl, apiKey) => {
    // Google: list models, find imagem
    const resp = await fetch(`${baseUrl}/models?key=${apiKey}`);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { models?: Array<{ name: string }> };
    const imgModel = json.models?.find(m => m.name.includes('imagen'));
    // Google returns "models/imagen-3.0-generate-002" → strip prefix
    return imgModel?.name.replace('models/', '') ?? null;
  },
};

async function discoverProvider(): Promise<{ name: string; config: ImageGenConfig; apiKey: string } | null> {
  if (_discoveredProvider !== undefined) return _discoveredProvider;

  const raw = readFileSync(join(import.meta.dirname, '../../services/ai/providers.json'), 'utf-8');
  const providers = JSON.parse(raw) as Record<string, ProviderEntry>;

  for (const [name, p] of Object.entries(providers)) {
    const envKey = p.envKey;
    const apiKey = envKey ? process.env[envKey] : undefined;
    if (!apiKey) continue;

    // Manual override from providers.json
    const manualCfg = p.capabilities?.imageGen;
    if (manualCfg) {
      _discoveredProvider = { name, config: manualCfg, apiKey };
      return _discoveredProvider;
    }

    // Auto-discover from provider API
    const discoverFn = IMAGE_GEN_DISCOVERY[name];
    if (!discoverFn) continue;

    const baseUrl = p.defaultBaseUrl || '';
    if (!baseUrl) continue;

    try {
      const model = await discoverFn(baseUrl, apiKey);
      if (model) {
        const apiType = name === 'openai' ? 'openai-image' : name === 'openrouter' ? 'openrouter-image' : 'google-image';
        _discoveredProvider = { name, config: { defaultModel: model, apiType }, apiKey };
        return _discoveredProvider;
      }
    } catch {
      // provider unreachable, skip
    }
  }

  _discoveredProvider = null;
  return null;
}

const inputSchema = z.strictObject({
  prompt: z.string().min(1).describe('A detailed description of the image to generate, in English'),
  size: z
    .enum(['1024x1024', '1792x1024', '1024x1792'])
    .optional()
    .describe('Image size: square, landscape, or portrait (default: 1024x1024)'),
  quality: z.enum(['standard', 'hd']).optional().describe('Quality: standard (faster) or hd (more detail)'),
  style: z.enum(['vivid', 'natural']).optional().describe('Style: vivid (hyper-real) or natural (realistic)'),
});

const outputSchema = z.object({
  url: z.string().describe('URL of the generated image'),
  localPath: z.string().optional().describe('Local file path if saved to disk'),
  revised_prompt: z.string().optional().describe('The revised prompt used by the model'),
  prompt: z.string().describe('The original prompt'),
  provider: z.string().describe('Which provider generated the image'),
});

export type Output = z.infer<typeof outputSchema>;

export const GenerateImageTool = buildTool({
  name: GENERATE_IMAGE_TOOL_NAME,
  searchHint: 'generate create draw AI images DALL-E',
  maxResultSizeChars: 5000,
  get inputSchema() {
    return inputSchema;
  },
  get outputSchema() {
    return outputSchema;
  },
  isEnabled() {
    const IMAGE_PROVIDERS = ['openai', 'google', 'openrouter'];
    const raw = readFileSync(join(import.meta.dirname, '../../services/ai/providers.json'), 'utf-8');
    const providers = JSON.parse(raw) as Record<string, ProviderEntry>;
    return IMAGE_PROVIDERS.some(id => {
      const p = providers[id];
      return p?.envKey && process.env[p.envKey] && IMAGE_GEN_DISCOVERY[id];
    });
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  userFacingName() {
    return 'Image Gen';
  },
  getToolUseSummary,
  getActivityDescription(input) {
    return `Generating image: ${input.prompt.slice(0, 60)}`;
  },
  async description(input) {
    return `Generating image: ${input.prompt.slice(0, 80)}`;
  },
  async prompt() {
    return getGenerateImagePrompt();
  },
  async checkPermissions(input): Promise<PermissionResult> {
    const prov = await discoverProvider();
    const label = prov ? `${prov.config.defaultModel} (${prov.name})` : 'image generation';
    return {
      behavior: 'passthrough',
      message: `GenerateImage via ${label}.\nPrompt: "${input.prompt.slice(0, 100)}${input.prompt.length > 100 ? '...' : ''}"`,
      suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: GENERATE_IMAGE_TOOL_NAME }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
    };
  },
  renderToolUseMessage,
  renderToolResultMessage,
  async call(input, _context, _canUseTool, _parentMessage) {
    const prov = await discoverProvider();
    if (!prov) throw new Error('No image generation provider configured. Set an API key.');

    const { prompt, size = '1024x1024', quality = 'standard', style = 'vivid' } = input;
    const { apiType, defaultModel: model } = prov.config;
    const apiKey = prov.apiKey;

    let imageUrl: string;
    let providerLabel: string;

    if (apiType === 'openai-image') {
      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, size, quality, style, n: 1 }),
      });
      if (!resp.ok) throw new Error(`DALL-E error (${resp.status}): ${await resp.text()}`);
      const json = (await resp.json()) as { data: Array<{ url: string; revised_prompt?: string }> };
      imageUrl = json.data[0].url;
      providerLabel = `${model} (${prov.name})`;
    } else if (apiType === 'openrouter-image') {
      const ar = size === '1792x1024' ? '16:9' : size === '1024x1792' ? '9:16' : '1:1';
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          modalities: ['image', 'text'],
          image_config: { aspect_ratio: ar, image_size: '1K' },
        }),
      });
      if (!resp.ok) throw new Error(`OpenRouter error (${resp.status}): ${await resp.text()}`);
      const json = (await resp.json()) as {
        choices: Array<{ message: { images?: Array<{ image_url?: { url: string } }> } }>;
      };
      imageUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? '';
      if (!imageUrl) throw new Error('OpenRouter returned no image');
      providerLabel = `${model} (${prov.name})`;
    } else if (apiType === 'google-image') {
      const ar = size === '1792x1024' ? '16:9' : size === '1024x1792' ? '9:16' : '1:1';
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: ar } }),
        },
      );
      if (!resp.ok) throw new Error(`Imagen error (${resp.status}): ${await resp.text()}`);
      const json = (await resp.json()) as { predictions: Array<{ bytesBase64Encoded: string }> };
      imageUrl = `data:image/png;base64,${json.predictions[0]?.bytesBase64Encoded}`;
      providerLabel = `${model} (${prov.name})`;
    } else {
      throw new Error(`Unknown image generation API type: ${apiType}`);
    }

    // Download and save locally
    let localPath: string | undefined;
    try {
      const imgResp = await fetch(imageUrl);
      if (imgResp.ok) {
        const buffer = Buffer.from(await imgResp.arrayBuffer());
        const dir = join(process.cwd(), '.clew', 'generated');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        localPath = join(dir, `image-${Date.now()}.png`);
        writeFileSync(localPath, buffer);
      }
    } catch { /* non-fatal */ }

    return { data: { url: imageUrl, localPath, prompt, provider: providerLabel } };
  },
});
