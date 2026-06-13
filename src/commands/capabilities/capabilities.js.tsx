import type { LocalJSXCommandCall } from '../../types/command.js';
import { detectCapabilities, formatCapabilitiesAsContext } from '../../utils/capabilities.js';

export const call: LocalJSXCommandCall = async onDone => {
  const capabilities = await detectCapabilities();
  const output = formatCapabilitiesAsContext(capabilities);

  onDone(
    [
      'System Capabilities',
      '',
      'This machine has the following tools and capabilities available:',
      '',
      output,
      '',
      'This information is automatically prepended to conversation context, so Lulu knows what tools are available on this machine.',
    ].join('\n'),
    { display: 'system' },
  );
  return null;
};
