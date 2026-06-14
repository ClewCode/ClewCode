import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PermissionResult } from 'src/utils/permissions/PermissionResult.js';
import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { getGenerateVideoPrompt, GENERATE_VIDEO_TOOL_NAME } from './prompt.js';
import { getToolUseSummary, renderToolUseMessage, renderToolUseProgressMessage, renderToolResultMessage } from './UI.js';

const inputSchema = z.strictObject({
  prompt: z.string().min(1).describe('A detailed description of the video to generate, in English'),
  duration: z.enum(['5', '10']).optional().describe('Duration in seconds: 5 or 10 (default: 5)'),
});

const outputSchema = z.object({
  url: z.string().describe('URL of the generated video'),
  localPath: z.string().optional().describe('Local file path if saved to disk'),
  status: z.string().optional().describe('Generation status'),
  prompt: z.string().describe('The original prompt'),
  provider: z.string().describe('Which provider generated the video'),
});

export type Output = z.infer<typeof outputSchema>;

export const GenerateVideoTool = buildTool({
  name: GENERATE_VIDEO_TOOL_NAME,
  searchHint: 'generate create AI video Runway',
  maxResultSizeChars: 5000,
  get inputSchema() {
    return inputSchema;
  },
  get outputSchema() {
    return outputSchema;
  },
  isEnabled() {
    return !!process.env.RUNWAY_API_KEY;
  },
  isConcurrencySafe() {
    return false; // video generation can take minutes
  },
  isReadOnly() {
    return true;
  },
  userFacingName() {
    return 'Video Gen';
  },
  getToolUseSummary,
  getActivityDescription(input) {
    return `Generating video: ${input.prompt.slice(0, 60)}`;
  },
  async description(input) {
    return `Generating video: ${input.prompt.slice(0, 80)}`;
  },
  async prompt() {
    return getGenerateVideoPrompt();
  },
  async checkPermissions(input): Promise<PermissionResult> {
    return {
      behavior: 'passthrough',
      message: `GenerateVideo will use Runway Gen-4.\nPrompt: "${input.prompt.slice(0, 100)}${input.prompt.length > 100 ? '...' : ''}"\nDuration: ${input.duration ?? '5'}s`,
      suggestions: [
        {
          type: 'addRules',
          rules: [{ toolName: GENERATE_VIDEO_TOOL_NAME }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ],
    };
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  async call(input, _context, _canUseTool, _parentMessage) {
    if (!process.env.RUNWAY_API_KEY) {
      throw new Error('Runway API key not configured. Set RUNWAY_API_KEY to enable video generation.');
    }

    const { prompt, duration = '5' } = input;

    // Runway Gen-4: submit generation task
    const submitResp = await fetch('https://api.runwayml.com/v1/generate/text-to-video', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        duration: Number(duration),
        model: 'gen4',
      }),
    });

    if (!submitResp.ok) {
      const err = await submitResp.text();
      throw new Error(`Runway API error (${submitResp.status}): ${err}`);
    }

    const submitJson = (await submitResp.json()) as { id: string; status: string };

    // Poll for completion (up to 120s)
    const maxAttempts = 24;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 5000));

      const pollResp = await fetch(`https://api.runwayml.com/v1/tasks/${submitJson.id}`, {
        headers: { Authorization: `Bearer ${process.env.RUNWAY_API_KEY}` },
      });

      if (!pollResp.ok) continue;

      const pollJson = (await pollResp.json()) as { status: string; output?: { video_url?: string } };

      if (pollJson.status === 'SUCCEEDED') {
        const videoUrl = pollJson.output?.video_url ?? '';

        // Download and save video locally
        let localPath: string | undefined;
        try {
          if (videoUrl) {
            const vidResp = await fetch(videoUrl);
            if (vidResp.ok) {
              const buffer = Buffer.from(await vidResp.arrayBuffer());
              const dir = join(process.cwd(), '.clew', 'generated');
              if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
              const ts = Date.now();
              localPath = join(dir, `video-${ts}.mp4`);
              writeFileSync(localPath, buffer);
            }
          }
        } catch {
          // Non-fatal
        }

        return {
          data: {
            url: videoUrl,
            localPath,
            status: 'completed',
            prompt,
            provider: 'Runway Gen-4',
          },
        };
      }

      if (pollJson.status === 'FAILED') {
        throw new Error('Runway video generation failed.');
      }
    }

    throw new Error('Video generation timed out after 2 minutes.');
  },
});
