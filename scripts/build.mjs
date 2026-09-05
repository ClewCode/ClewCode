import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const features = ['EXTRACT_MEMORIES', 'CHICAGO_MCP', 'VOICE_MODE', 'AWAY_SUMMARY', 'AGENT_TRIGGERS'];
const externals = [
  'electron',
  'chromium-bidi*',
  '@ant/claude-for-chrome-mcp',
  '@anthropic-ai/bedrock-sdk',
  '@anthropic-ai/foundry-sdk',
  '@anthropic-ai/vertex-sdk',
  '@anthropic-ai/mcpb',
  '@aws-sdk/client-bedrock-runtime',
  'google-auth-library',
  'sharp',
  'asciichart',
  'audio-capture-napi',
  'modifiers-napi',
  '@xenova/transformers',
  'onnxruntime-node',
  'sqlite-vec',
  'playwright',
  'playwright-core',
  'node-pty',
];

const args = [
  'build',
  '--production',
  ...features.flatMap(feature => ['--feature', feature]),
  join(root, 'src/main.tsx'),
  '--outdir',
  join(root, 'dist'),
  '--target',
  'bun',
  ...externals.flatMap(external => ['--external', external]),
];

const child = spawn('bun', args, {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
});

child.on('error', error => {
  console.error(`Failed to start Bun build: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exitCode = code ?? 1;
});
