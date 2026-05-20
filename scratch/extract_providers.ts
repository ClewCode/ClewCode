import { PROVIDER_REGISTRY } from 'd:/Projects/Github/claude-code-mark1/src/services/ai/providerRegistry.ts';
import * as fs from 'fs';

const data = {};
for (const [key, value] of Object.entries(PROVIDER_REGISTRY)) {
  const { provider, ...rest } = value as any;
  data[key] = rest;
}

fs.writeFileSync('d:/Projects/Github/claude-code-mark1/src/services/ai/providers.json', JSON.stringify(data, null, 2));
console.log('Successfully wrote providers.json');
