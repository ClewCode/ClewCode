import { test } from 'vitest';
import { CodeAssistProvider } from '../services/ai/providers/CodeAssistProvider.js';

test('test invoking CodeAssistProvider', async () => {
  const provider = new CodeAssistProvider();
  console.log('Provider initialized');
  try {
    const client = await provider.createClient({});
    console.log('Client created');
    const result = await (client as any).chat.completions.create({
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    });
    console.log('SUCCESS result:', result);
  } catch (err: any) {
    console.error('ERROR CALLING PROVIDER:', err);
    if (err.status) console.error('Status:', err.status);
    if (err.message) console.error('Message:', err.message);
    if (err.stack) console.error('Stack:', err.stack);
  }
}, 30000); // 30s timeout
