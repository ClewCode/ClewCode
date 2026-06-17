import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const generatedDir = new URL('../src/generated/', import.meta.url);
mkdirSync(generatedDir, { recursive: true });

writeFileSync(
  new URL('./version.json', generatedDir),
  JSON.stringify({
    BUILD_VERSION: pkg.version,
    PACKAGE_URL: pkg.name,
    FEEDBACK_CHANNEL: 'https://github.com/ClewCode/ClewCode/issues',
    ISSUES_EXPLAINER: 'visit https://github.com/ClewCode/ClewCode/issues',
  }),
  'utf8',
);
