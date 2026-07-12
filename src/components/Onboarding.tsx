import type React from 'react';
import { Box, useTheme } from '../ink.js';
import type { ThemeSetting } from '../utils/theme.js';
import { LogoV2 } from './LogoV2/LogoV2.js';
import { ThemePicker } from './ThemePicker.js';

type Props = {
  onDone(): void;
};

export function Onboarding({ onDone }: Props): React.ReactNode {
  const [theme, setTheme] = useTheme();

  function handleThemeSelection(newTheme: ThemeSetting) {
    setTheme(newTheme);
    onDone();
  }

  return (
    <Box flexDirection="column">
      <LogoV2 isPersonal />
      <Box flexDirection="column" marginTop={1} marginX={1}>
        <ThemePicker
          onThemeSelect={handleThemeSelection}
          showIntroText={true}
          helpText="To change this later, run /theme"
          hideEscToCancel={true}
          skipExitHandling={true}
        />
      </Box>
    </Box>
  );
}
