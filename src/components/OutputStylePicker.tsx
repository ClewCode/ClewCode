import figures from 'figures';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  clearAllOutputStylesCache,
  getAllOutputStyles,
  OUTPUT_STYLE_CONFIG,
  type OutputStyleConfig,
} from '../constants/outputStyles.js';
import { Box, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import {
  type GeneratedOutputStyle,
  generateCustomOutputStyle,
  saveCustomOutputStyle,
} from '../outputStyles/customStyleGenerator.js';
import type { OutputStyle } from '../utils/config.js';
import { getCwd } from '../utils/cwd.js';
import type { OptionWithDescription } from './CustomSelect/select.js';
import { Select } from './CustomSelect/select.js';
import { Dialog } from './design-system/Dialog.js';
import TextInput from './TextInput.js';

const DEFAULT_OUTPUT_STYLE_LABEL = 'Default';
const DEFAULT_OUTPUT_STYLE_DESCRIPTION = 'Claude completes coding tasks efficiently and provides concise responses';
const CREATE_CUSTOM_VALUE = '__create_custom_ai__';

function mapConfigsToOptions(styles: { [styleName: string]: OutputStyleConfig | null }): OptionWithDescription[] {
  const options: OptionWithDescription[] = Object.entries(styles).map(([style, config]) => ({
    label: config?.name ?? DEFAULT_OUTPUT_STYLE_LABEL,
    value: style,
    description: config?.description ?? DEFAULT_OUTPUT_STYLE_DESCRIPTION,
  }));

  options.push({
    label: '+ Create custom style with AI...',
    value: CREATE_CUSTOM_VALUE,
    description: 'Describe how you want Clew to communicate, and AI will generate and save it',
  });

  return options;
}

export type OutputStylePickerProps = {
  initialStyle: OutputStyle;
  onComplete: (style: OutputStyle) => void;
  onCancel: () => void;
  isStandaloneCommand?: boolean;
};

type Mode = 'select' | 'input_prompt' | 'generating' | 'review';

export function OutputStylePicker({
  initialStyle,
  onComplete,
  onCancel,
  isStandaloneCommand,
}: OutputStylePickerProps): React.ReactNode {
  const [mode, setMode] = useState<Mode>('select');
  const [styleOptions, setStyleOptions] = useState<OptionWithDescription[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Custom style creation states
  const [promptInput, setPromptInput] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const [generatedStyle, setGeneratedStyle] = useState<GeneratedOutputStyle | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStyles = useCallback(() => {
    setIsLoading(true);
    getAllOutputStyles(getCwd())
      .then(allStyles => {
        const options = mapConfigsToOptions(allStyles);
        setStyleOptions(options);
        setIsLoading(false);
      })
      .catch(() => {
        const builtInOptions = mapConfigsToOptions(OUTPUT_STYLE_CONFIG);
        setStyleOptions(builtInOptions);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadStyles();
  }, [loadStyles]);

  // Handle ESC in sub-modes
  useKeybinding(
    'confirm:no',
    () => {
      if (mode !== 'select') {
        setMode('select');
      } else {
        onCancel();
      }
    },
    { context: 'Settings' },
  );

  const handleStyleSelect = useCallback(
    (style: string) => {
      if (style === CREATE_CUSTOM_VALUE) {
        setErrorMessage(null);
        setMode('input_prompt');
        return;
      }
      const outputStyle = style as OutputStyle;
      onComplete(outputStyle);
    },
    [onComplete],
  );

  const handleGenerate = useCallback(async (instructions: string) => {
    const trimmed = instructions.trim();
    if (!trimmed) return;
    setMode('generating');
    setErrorMessage(null);
    try {
      const generated = await generateCustomOutputStyle(trimmed);
      setGeneratedStyle(generated);
      setMode('review');
    } catch (err) {
      setErrorMessage(`Failed to generate output style: ${err}`);
      setMode('input_prompt');
    }
  }, []);

  const handleReviewAction = useCallback(
    (action: string) => {
      if (!generatedStyle) return;

      if (action === 'use_and_save') {
        try {
          saveCustomOutputStyle(generatedStyle, 'user');
          clearAllOutputStylesCache();
          onComplete(generatedStyle.name);
        } catch (err) {
          setErrorMessage(`Failed to save output style: ${err}`);
        }
      } else if (action === 'regenerate') {
        void handleGenerate(promptInput);
      } else if (action === 'edit_prompt') {
        setMode('input_prompt');
      } else if (action === 'cancel') {
        setMode('select');
      }
    },
    [generatedStyle, handleGenerate, onComplete, promptInput],
  );

  if (mode === 'input_prompt') {
    return (
      <Dialog
        title="Create custom output style"
        onCancel={() => setMode('select')}
        hideInputGuide={!isStandaloneCommand}
        hideBorder={!isStandaloneCommand}
      >
        <Box flexDirection="column" gap={1}>
          <Text>Describe the tone, formatting, or behavior you want:</Text>
          <Box flexDirection="row" gap={1}>
            <Text color="cyan">{figures.pointer}</Text>
            <TextInput
              value={promptInput}
              onChange={setPromptInput}
              onSubmit={() => handleGenerate(promptInput)}
              focus={true}
              showCursor={true}
              placeholder="e.g. Casual Thai with emojis, strict architect, or pirate..."
              columns={60}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
            />
          </Box>
          {errorMessage && <Text color="error">{errorMessage}</Text>}
          <Text dimColor>Press Enter to generate with AI · Esc to cancel</Text>
        </Box>
      </Dialog>
    );
  }

  if (mode === 'generating') {
    return (
      <Dialog
        title="Generating output style"
        onCancel={() => setMode('input_prompt')}
        hideInputGuide={!isStandaloneCommand}
        hideBorder={!isStandaloneCommand}
      >
        <Box flexDirection="column" gap={1}>
          <Text color="cyan">{figures.star} Generating custom output style with AI…</Text>
          <Text dimColor>Crafting system prompt and configuration from your instructions</Text>
        </Box>
      </Dialog>
    );
  }

  if (mode === 'review' && generatedStyle) {
    const reviewOptions: OptionWithDescription[] = [
      {
        label: '✓ Save and use this style',
        value: 'use_and_save',
        description: 'Save to ~/.clew/output-styles/ and set as active style',
      },
      {
        label: '↻ Regenerate with AI',
        value: 'regenerate',
        description: 'Generate a fresh variation with AI',
      },
      {
        label: '✎ Edit prompt / refine instructions',
        value: 'edit_prompt',
        description: 'Modify your prompt description to guide the AI',
      },
      {
        label: '✗ Cancel',
        value: 'cancel',
        description: 'Return to style list without saving',
      },
    ];

    // Truncate prompt lines for clean display
    const promptLines = generatedStyle.prompt.split('\n');
    const previewText =
      promptLines.slice(0, 6).join('\n') +
      (promptLines.length > 6 ? `\n... (+${promptLines.length - 6} more lines)` : '');

    return (
      <Dialog
        title={`Review Output Style: ${generatedStyle.name}`}
        onCancel={() => setMode('select')}
        hideInputGuide={!isStandaloneCommand}
        hideBorder={!isStandaloneCommand}
      >
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text bold color="success">
              Name: {generatedStyle.name}
            </Text>
            <Text dimColor>Description: {generatedStyle.description}</Text>
          </Box>

          <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="dim">
            <Text dimColor bold>
              Prompt Preview:
            </Text>
            <Text>{previewText}</Text>
          </Box>

          {errorMessage && <Text color="error">{errorMessage}</Text>}

          <Text bold>Choose what to do next:</Text>
          <Select options={reviewOptions} onChange={handleReviewAction} visibleOptionCount={4} />
        </Box>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Preferred output style"
      onCancel={onCancel}
      hideInputGuide={!isStandaloneCommand}
      hideBorder={!isStandaloneCommand}
    >
      <Box flexDirection="column" gap={1}>
        <Box marginTop={1}>
          <Text dimColor>This changes how Clew Code communicates with you</Text>
        </Box>
        {isLoading ? (
          <Text dimColor>Loading output styles…</Text>
        ) : (
          <Select
            options={styleOptions}
            onChange={handleStyleSelect}
            visibleOptionCount={10}
            defaultValue={initialStyle}
          />
        )}
      </Box>
    </Dialog>
  );
}
