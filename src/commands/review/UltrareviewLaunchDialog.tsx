import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { Select } from '../../components/CustomSelect/select.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { Box, Text } from '../../ink.js';

export type UltrareviewScope = {
  target: string;
  base?: string;
  billingNote?: string;
};

type Props = {
  scope: UltrareviewScope;
  onProceed: (signal: AbortSignal) => Promise<void>;
  onChangeScope: () => void;
  onCancel: () => void;
};

function StatsLine({ scope: _scope }: { scope: UltrareviewScope }): React.ReactNode {
  return null;
}

function ScopeLine({ scope }: { scope: UltrareviewScope }): React.ReactNode {
  if (scope.base) {
    return (
      <Text>
        Reviewing <Text color="cyan">{scope.target}</Text> against <Text color="cyan">{scope.base}</Text>.
      </Text>
    );
  }

  return (
    <Text>
      Reviewing <Text color="cyan">{scope.target}</Text>.
    </Text>
  );
}

export function UltrareviewLaunchDialog({ scope, onProceed, onChangeScope, onCancel }: Props): React.ReactNode {
  const [isLaunching, setIsLaunching] = useState(false);
  const abortControllerRef = useRef(new AbortController());

  const handleCancel = useCallback(() => {
    abortControllerRef.current.abort();
    onCancel();
  }, [onCancel]);

  const handleSelect = useCallback(
    (value: string) => {
      if (value === 'run') {
        setIsLaunching(true);
        void onProceed(abortControllerRef.current.signal).catch(err => {
          console.error('Ultrareview launch failed:', err);
          setIsLaunching(false);
        });
      } else if (value === 'scope') {
        onChangeScope();
      } else {
        handleCancel();
      }
    },
    [handleCancel, onChangeScope, onProceed],
  );

  return (
    <Dialog title="Run ultrareview in the cloud?" onCancel={handleCancel} color="permission" hideInputGuide>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>Finds and verifies bugs using a multi-agent review fleet.</Text>

        <Box flexDirection="column">
          <ScopeLine scope={scope} />
          <StatsLine scope={scope} />
          {scope.billingNote ? <Text dimColor>{scope.billingNote}</Text> : null}
        </Box>

        {isLaunching ? (
          <Text color="permission">Launching ultrareview...</Text>
        ) : (
          <Select
            options={[
              { label: 'Run ultrareview', value: 'run' },
              { label: 'Change scope', value: 'scope' },
              { label: 'Cancel', value: 'cancel' },
            ]}
            onChange={handleSelect}
            onCancel={handleCancel}
          />
        )}
      </Box>
    </Dialog>
  );
}
