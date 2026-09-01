import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearAllOutputStylesCache } from '../constants/outputStyles.js';
import { queryHaiku } from '../services/api/claude.js';
import { getCwd } from '../utils/cwd.js';
import { logForDebugging } from '../utils/debug.js';
import { getClewConfigHomeDir } from '../utils/envUtils.js';
import { safeParseJSON } from '../utils/json.js';
import { logError } from '../utils/log.js';
import { extractTextContent } from '../utils/messages.js';
import { asSystemPrompt } from '../utils/systemPromptType.js';

export type GeneratedOutputStyle = {
  name: string;
  slug: string;
  description: string;
  prompt: string;
};

/**
 * Generate a complete Output Style configuration from a user prompt using AI.
 */
export async function generateCustomOutputStyle(
  userInstructions: string,
  signal?: AbortSignal,
): Promise<GeneratedOutputStyle> {
  const systemPrompt = asSystemPrompt([
    `You are an expert system prompt engineer for Clew Code (an AI coding assistant CLI).
The user wants to create a custom "Output Style" that configures how Clew Code communicates with them.

Given the user's description/prompt, produce a JSON object with:
1. "name": A concise, catchy display name for the style (e.g. "Friendly Thai", "Pirate", "Socratic Guide", "Architect").
2. "slug": A kebab-case filename slug (e.g. "friendly-thai", "pirate", "socratic-guide"). Lowercase letters and hyphens only.
3. "description": A 1-2 sentence description explaining what the style does.
4. "prompt": The actual system prompt instructions that will guide Clew Code's communication tone, formatting, language, or behavior. It should be clear, detailed, and formatted in Markdown.

Output must be valid JSON only.`,
  ]);

  try {
    const result = await queryHaiku({
      systemPrompt,
      userPrompt: `Create an output style based on these instructions:\n"${userInstructions}"`,
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            prompt: { type: 'string' },
          },
          required: ['name', 'slug', 'description', 'prompt'],
          additionalProperties: false,
        },
      },
      signal: signal ?? new AbortController().signal,
      options: {
        querySource: 'custom_output_style_generator' as any,
        agents: [],
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    });

    const text = extractTextContent(result.message.content);
    const parsed = safeParseJSON(text) as GeneratedOutputStyle | null;

    if (parsed && typeof parsed.name === 'string' && typeof parsed.prompt === 'string') {
      const slug = (parsed.slug || parsed.name)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      return {
        name: parsed.name.trim(),
        slug: slug || 'custom-style',
        description: parsed.description?.trim() || `Custom style: ${parsed.name}`,
        prompt: parsed.prompt.trim(),
      };
    }
  } catch (error) {
    logForDebugging(`queryHaiku for output style generation failed: ${error}`, { level: 'warn' });
  }

  // Fallback if AI generation is unavailable (e.g. offline)
  const name = userInstructions.slice(0, 30).trim() || 'Custom Style';
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'custom-style';

  return {
    name,
    slug,
    description: `Custom style based on: ${userInstructions.slice(0, 60)}`,
    prompt: `You are an interactive CLI tool that helps users with software engineering tasks. Follow these communication guidelines:\n\n${userInstructions}`,
  };
}

/**
 * Save a custom output style to the user's ~/.clew/output-styles/ directory.
 * @returns The saved file path
 */
export function saveCustomOutputStyle(style: GeneratedOutputStyle, scope: 'user' | 'project' = 'user'): string {
  const baseDir =
    scope === 'project' ? join(getCwd(), '.clew', 'output-styles') : join(getClewConfigHomeDir(), 'output-styles');

  mkdirSync(baseDir, { recursive: true });

  const fileName = `${style.slug}.md`;
  const targetPath = join(baseDir, fileName);

  const fileContent = `---
name: ${style.name}
description: ${style.description}
keep-coding-instructions: true
---
${style.prompt}
`;

  writeFileSync(targetPath, fileContent, 'utf-8');
  clearAllOutputStylesCache();

  return targetPath;
}
