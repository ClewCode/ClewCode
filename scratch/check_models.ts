import { fetchProviderModels } from '../src/services/ai/providerModels.js';
import { ProviderManager } from '../src/services/ai/ProviderManager.js';

async function check() {
  console.log('--- Checking OpenAI (Subscriber/Plus) Models ---');
  try {
    const openaiModels = await fetchProviderModels('openai');
    console.log(`Found ${openaiModels.length} models for OpenAI.`);
    openaiModels.slice(0, 5).forEach(m => console.log(` - ${m.id} (${m.label})`));
  } catch (e) {
    console.log('OpenAI Check failed (might need login):', (e as Error).message);
  }

  console.log('\n--- Checking Copilot Models ---');
  try {
    const copilotModels = await fetchProviderModels('copilot');
    console.log(`Found ${copilotModels.length} models for Copilot.`);
    copilotModels.forEach(m => console.log(` - ${m.id} (${m.label})`));

    console.log('\n--- Checking Together AI Models ---');
    const togetherModels = await fetchProviderModels('together');
    console.log(`Found ${togetherModels.length} models for Together AI.`);
    togetherModels.forEach(m => console.log(` - ${m.id} (${m.label})`));

    console.log('\n--- Checking Fireworks AI Models ---');
    const fireworksModels = await fetchProviderModels('fireworks');
    console.log(`Found ${fireworksModels.length} models for Fireworks AI.`);
    fireworksModels.forEach(m => console.log(` - ${m.id} (${m.label})`));

    console.log('\n--- Checking NVIDIA NIM Models ---');
    const nvidiaModels = await fetchProviderModels('nvidia');
    console.log(`Found ${nvidiaModels.length} models for NVIDIA NIM.`);
    nvidiaModels.forEach(m => console.log(` - ${m.id} (${m.label})`));
  } catch (err) {
    console.error('Check failed:', (err as Error).message);
  }
}

check();
