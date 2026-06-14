export const GENERATE_IMAGE_TOOL_NAME = 'GenerateImage';

export function getGenerateImagePrompt(): string {
  return `
## Image Generation

You can generate images using the **${GENERATE_IMAGE_TOOL_NAME}** tool. Use it when the user asks you to create, draw, or generate an image.

### How to use
- Provide a detailed, descriptive prompt in English (DALL-E works best with English)
- Choose an appropriate size: \`1024x1024\` (square), \`1792x1024\` (landscape), or \`1024x1792\` (portrait)
- Choose quality: \`standard\` (faster) or \`hd\` (more detail)
- Choose style: \`vivid\` (hyper-real, dramatic) or \`natural\` (more realistic, less dramatic)

### After generating
- Tell the user the image URL and the revised prompt that was used
- If the user wants to save the image locally, use the URL in a Bash curl/wget command
`;
}
