import ansis from 'ansis';
import * as React from 'react';
import { OutputStylePicker } from '../../components/OutputStylePicker.js';
import { DEFAULT_OUTPUT_STYLE_NAME, getAllOutputStyles } from '../../constants/outputStyles.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import type { OutputStyle } from '../../utils/config.js';
import { getCwd } from '../../utils/cwd.js';
import { getSettings, updateSettingsForSource } from '../../utils/settings/settings.js';

function OutputStylePickerCommand({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const settings = getSettings();
  const currentStyle = (settings?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME) as OutputStyle;

  return (
    <OutputStylePicker
      initialStyle={currentStyle}
      isStandaloneCommand={true}
      onComplete={style => {
        const resolvedStyle = style ?? DEFAULT_OUTPUT_STYLE_NAME;
        updateSettingsForSource('localSettings', { outputStyle: resolvedStyle });
        void logEvent('tengu_output_style_changed', {
          style: resolvedStyle as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          source: 'slash_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          settings_source: 'localSettings' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
        onDone(`Preferred output style set to ${ansis.bold(resolvedStyle)}`);
      }}
      onCancel={() => {
        onDone('Output style selection canceled', { display: 'system' });
      }}
    />
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const trimmed = typeof args === 'string' ? args.trim() : '';

  if (!trimmed) {
    return <OutputStylePickerCommand onDone={onDone} />;
  }

  const allStyles = await getAllOutputStyles(getCwd());
  const styleKeys = Object.keys(allStyles);

  // Case-insensitive match against style keys or names
  const matchedKey = styleKeys.find(
    k => k.toLowerCase() === trimmed.toLowerCase() || allStyles[k]?.name.toLowerCase() === trimmed.toLowerCase(),
  );

  if (matchedKey) {
    updateSettingsForSource('localSettings', { outputStyle: matchedKey });
    void logEvent('tengu_output_style_changed', {
      style: matchedKey as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      source: 'slash_command' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      settings_source: 'localSettings' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    onDone(`Preferred output style set to ${ansis.bold(matchedKey)}`);
    return;
  }

  const validOptions = styleKeys.join(', ');
  onDone(
    `Unknown output style "${trimmed}". Available styles: ${validOptions}\nUse ${ansis.bold('/output-style')} without arguments to pick interactively.`,
    { display: 'system' },
  );
};
