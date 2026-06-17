import * as React from 'react';
import { Select } from '../../components/CustomSelect/select.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { Box, Text } from '../../ink.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';

export function DatadogSettings({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const [config, setConfig] = React.useState(() => getGlobalConfig());

  // Derive statuses
  const isGlobalDisabled = config.telemetryDisabled === true;
  const isDatadogDisabled = config.datadogDisabled === true;
  const isFirstPartyDisabled = config.firstPartyDisabled === true;

  const handleSelect = (choice: 'global' | 'datadog' | 'firstParty' | 'done') => {
    if (choice === 'done') {
      onDone('Telemetry settings updated successfully.', { display: 'system' });
      return;
    }

    saveGlobalConfig(current => {
      const next = { ...current };
      if (choice === 'global') {
        next.telemetryDisabled = !next.telemetryDisabled;
      } else if (choice === 'datadog') {
        next.datadogDisabled = !next.datadogDisabled;
      } else if (choice === 'firstParty') {
        next.firstPartyDisabled = !next.firstPartyDisabled;
      }
      return next;
    });

    // Update local state to re-render
    setConfig(getGlobalConfig());
  };

  const options = [
    {
      label: `Global Telemetry: ${isGlobalDisabled ? '❌ Disabled' : '✅ Enabled'}`,
      description: 'Master switch to completely disable all analytical network out-traffic.',
      value: 'global' as const,
    },
    {
      label: `Datadog Analytics: ${isDatadogDisabled ? '❌ Disabled' : '✅ Enabled'}`,
      description: 'Sends sampled error metrics and operational logs to Datadog (PII stripped).',
      value: 'datadog' as const,
    },
    {
      label: `First-Party Analytics: ${isFirstPartyDisabled ? '❌ Disabled' : '✅ Enabled'}`,
      description: 'Sends CLI command speed and performance metrics directly to Anthropic.',
      value: 'firstParty' as const,
    },
    {
      label: 'Done',
      description: 'Save changes and return to the console.',
      value: 'done' as const,
    },
  ];

  return (
    <Dialog
      title="Telemetry & Privacy Controls"
      subtitle="Select a setting to toggle or finalize changes"
      onCancel={() => onDone('Dialog cancelled', { display: 'system' })}
    >
      <Box flexDirection="column" gap={1}>
        <Text>Manage how Clew Code sends logs and analytical data back over the net.</Text>
        {isGlobalDisabled && (
          <Text color="warning" italic>
            ⚠️ Note: All telemetry out-traffic is currently blocked because Global Telemetry is disabled.
          </Text>
        )}
        <Select<any> onChange={handleSelect} options={options} />
      </Box>
    </Dialog>
  );
}

export async function call(onDone: LocalJSXCommandOnDone, _context: any, _args: string) {
  return <DatadogSettings onDone={onDone} />;
}
