import * as React from 'react';
import { Box, Text, useInput } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { PermissionDialog } from './permissions/PermissionDialog.js';

type Props = {
  isOpen: boolean;
  isLoading: boolean;
  originalPrompt: string;
  enhancedPrompt: string;
  onApply: () => void;
  onCancel: () => void;
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function PromptEnhancementDialog({
  isOpen,
  isLoading,
  originalPrompt,
  enhancedPrompt,
  onApply,
  onCancel,
}: Props): React.ReactNode {
  const [spinnerFrame, setSpinnerFrame] = React.useState(0);

  React.useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setSpinnerFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isLoading]);

  useKeybinding('app:interrupt', onCancel, { isActive: isOpen && !isLoading });
  useInput(
    (_input, key) => {
      if (key.return) onApply();
    },
    { isActive: isOpen && !isLoading },
  );

  if (!isOpen) {
    return null;
  }

  return (
    <PermissionDialog title="Prompt Enhancement" color="permission" innerPaddingX={1}>
      <Box flexDirection="column" paddingY={1}>
        {isLoading ? (
          <Box flexDirection="row">
            <Text>{SPINNER_FRAMES[spinnerFrame]} Enhancing prompt...</Text>
          </Box>
        ) : (
          <>
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>Original:</Text>
              <Text dimColor>{originalPrompt}</Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
              <Text bold>Enhanced:</Text>
              <Text>{enhancedPrompt}</Text>
            </Box>

            <Box flexDirection="row" marginTop={1}>
              <Text dimColor>
                Press <Text bold>Enter</Text> to apply or <Text bold>Esc</Text> to cancel
              </Text>
            </Box>
          </>
        )}
      </Box>
    </PermissionDialog>
  );
}
