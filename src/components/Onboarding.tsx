import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { setupTerminal, shouldOfferTerminalSetup } from '../commands/terminalSetup/terminalSetup.js';
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Link, Newline, Text, useTheme } from '../ink.js';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import { env } from '../utils/env.js';
import type { ThemeSetting } from '../utils/theme.js';
import { Select } from './CustomSelect/select.js';
import { WelcomeV2 } from './LogoV2/WelcomeV2.js';
import { PressEnterToContinue } from './PressEnterToContinue.js';
import { ThemePicker } from './ThemePicker.js';
import { OrderedList } from './ui/OrderedList.js';

type StepId = 'theme' | 'commands' | 'security' | 'terminal-setup';

interface OnboardingStep {
  id: StepId;
  component: React.ReactNode;
}

type Props = {
  onDone(): void;
};

function QuickCommandsContent() {
  return (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      <Text bold>Quick reference — frequently used commands:</Text>
      <Box flexDirection="column" width={70} gap={0} marginTop={1}>
        <OrderedList>
          <OrderedList.Item>
            <Text bold>/init</Text>
            <Text dimColor wrap="wrap">
              <Newline />
              Create or update a CLAUDE.md file with instructions for Clew Code to follow
            </Text>
          </OrderedList.Item>
          <OrderedList.Item>
            <Text bold>/theme</Text>
            <Text dimColor wrap="wrap">
              <Newline />
              Switch between dark, light and colorblind-friendly themes
            </Text>
          </OrderedList.Item>
          <OrderedList.Item>
            <Text bold>/terminal-setup</Text>
            <Text dimColor wrap="wrap">
              <Newline />
              Configure terminal keybindings for the optimal editing experience
            </Text>
          </OrderedList.Item>
          <OrderedList.Item>
            <Text bold>/model</Text>
            <Text dimColor wrap="wrap">
              <Newline />
              View and switch between available AI models for your provider
            </Text>
          </OrderedList.Item>
          <OrderedList.Item>
            <Text bold>/help</Text>
            <Text dimColor wrap="wrap">
              <Newline />
              Show all available commands, skills and keyboard shortcuts
            </Text>
          </OrderedList.Item>
        </OrderedList>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Tip: Any command can be run by typing <Text bold>/</Text> followed by the command name
        </Text>
      </Box>
      <PressEnterToContinue />
    </Box>
  );
}

export function Onboarding({ onDone }: Props): React.ReactNode {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [theme, setTheme] = useTheme();

  function goToNextStep() {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      onDone();
    }
  }

  function goToPrevStep() {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  }

  function handleThemeSelection(newTheme: ThemeSetting) {
    setTheme(newTheme);
    goToNextStep();
  }

  const exitState = useExitOnCtrlCDWithKeybindings();

  // Theme step
  const themeStep = (
    <Box marginX={1}>
      <ThemePicker
        onThemeSelect={handleThemeSelection}
        showIntroText={true}
        helpText="To change this later, run /theme"
        hideEscToCancel={true}
        skipExitHandling={true}
      />
    </Box>
  );

  // Quick commands step
  const commandsStep = <QuickCommandsContent />;

  // Security step
  const securityStep = (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      <Text bold>Security notes:</Text>
      <Box flexDirection="column" width={70}>
        <OrderedList>
          <OrderedList.Item>
            <Text>AI models can make mistakes</Text>
            <Text dimColor wrap="wrap">
              You should always review the AI&apos;s responses, especially when
              <Newline />
              running code.
              <Newline />
            </Text>
          </OrderedList.Item>
          <OrderedList.Item>
            <Text>Due to prompt injection risks, only use with code you trust</Text>
            <Text dimColor wrap="wrap">
              For more details see:
              <Newline />
              <Link url="https://code.claude.com/docs/en/security" />
            </Text>
          </OrderedList.Item>
        </OrderedList>
      </Box>
      <PressEnterToContinue />
    </Box>
  );

  // Terminal setup step
  const terminalSetupStep = shouldOfferTerminalSetup() ? (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      <Text bold>Use Clew Code&apos;s terminal setup?</Text>
      <Box flexDirection="column" width={70} gap={1}>
        <Text>
          For the optimal coding experience, enable the recommended settings
          <Newline />
          for your terminal:{' '}
          {env.terminal === 'Apple_Terminal' ? 'Option+Enter for newlines and visual bell' : 'Shift+Enter for newlines'}
        </Text>
        <Select
          options={[
            {
              label: 'Yes, use recommended settings',
              value: 'install',
            },
            {
              label: 'No, maybe later with /terminal-setup',
              value: 'no',
            },
          ]}
          onChange={value => {
            if (value === 'install') {
              void setupTerminal(theme)
                .catch(() => {
                  /* noop */
                })
                .finally(goToNextStep);
            } else {
              goToNextStep();
            }
          }}
          onCancel={() => goToNextStep()}
        />
        <Text dimColor>
          {exitState.pending ? <>Press {exitState.keyName} again to exit</> : <>Enter to confirm · Esc to skip</>}
        </Text>
      </Box>
    </Box>
  ) : null;

  // Build steps array
  const steps: OnboardingStep[] = [{ id: 'theme', component: themeStep }];
  steps.push({ id: 'commands', component: commandsStep });
  steps.push({ id: 'security', component: securityStep });
  if (shouldOfferTerminalSetup()) {
    steps.push({ id: 'terminal-setup', component: terminalSetupStep });
  }

  const currentStep = steps[currentStepIndex];

  const handleSecurityContinue = useCallback(() => {
    if (currentStepIndex === steps.length - 1) {
      onDone();
    } else {
      goToNextStep();
    }
  }, [currentStepIndex, steps.length]);

  const handleTerminalSetupSkip = useCallback(() => {
    goToNextStep();
  }, []);

  useKeybindings(
    {
      'confirm:yes': handleSecurityContinue,
    },
    {
      context: 'Confirmation',
      isActive: currentStep?.id === 'security' || currentStep?.id === 'commands',
    },
  );

  useKeybindings(
    {
      'confirm:no': handleTerminalSetupSkip,
    },
    {
      context: 'Confirmation',
      isActive: currentStep?.id === 'terminal-setup',
    },
  );

  useKeybindings(
    {
      dismiss: goToPrevStep,
    },
    {
      context: 'Onboarding',
      isActive: currentStepIndex > 0 && currentStep?.id !== 'terminal-setup',
    },
  );

  const totalSteps = steps.length;
  const showProgress = totalSteps > 1;

  return (
    <Box flexDirection="column">
      <WelcomeV2 />
      <Box flexDirection="column" marginTop={1}>
        {showProgress && (
          <Box paddingLeft={1} marginBottom={1}>
            <Text dimColor>
              Step {currentStepIndex + 1}/{totalSteps} <Text color="claude">{'●'.repeat(currentStepIndex + 1)}</Text>
              <Text dimColor>{'○'.repeat(Math.max(0, totalSteps - currentStepIndex - 1))}</Text>
            </Text>
          </Box>
        )}
        {currentStep?.component}
        {currentStepIndex > 0 && currentStep?.id !== 'terminal-setup' && (
          <Box paddingLeft={1} marginTop={1}>
            <Text dimColor>Esc to go back</Text>
          </Box>
        )}
        {exitState.pending && (
          <Box padding={1}>
            <Text dimColor>Press {exitState.keyName} again to exit</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
