export const GENERATE_VIDEO_TOOL_NAME = 'GenerateVideo';

export function getGenerateVideoPrompt(): string {
  return `
## Video Generation

You can generate short videos using the **${GENERATE_VIDEO_TOOL_NAME}** tool. Use it when the user asks you to create, make, or generate a video.

### How to use
- Provide a detailed, descriptive prompt in English describing the video content
- Videos take 30-120 seconds to generate — let the user know it will take a moment
- Results include a download URL the user can access

### Limitations
- Video generation requires a Runway API key (\`RUNWAY_API_KEY\` env var)
- Videos are typically 5-10 seconds long
- The API may reject prompts with violent, sexual, or copyrighted content
`;
}
