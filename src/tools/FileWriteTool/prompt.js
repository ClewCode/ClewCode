export const FILE_WRITE_TOOL_NAME = 'Write';
export const DESCRIPTION = 'Write a file to the local filesystem.';
function getPreReadInstruction() {
  return '';
}
export function getWriteToolDescription() {
  return `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.${getPreReadInstruction()}
- Reading an existing file first is still useful for context, but it is not required before using this tool.
- Prefer the Edit tool for modifying existing files \u2014 it only sends the diff. Only use this tool to create new files or for complete rewrites.
- NEVER create documentation files (*.md) or README files unless explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`;
}
