import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { setupTerminal, shouldOfferTerminalSetup } from '../commands/terminalSetup/terminalSetup.js';
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Link, Newline, Text, useTheme } from '../ink.js';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import { ProviderManager } from '../services/ai/ProviderManager.js';
import type { ProviderId } from '../services/ai/providers/ProviderInterface.js';
import { isAnthropicAuthEnabled } from '../utils/auth.js';
import { normalizeApiKeyForConfig } from '../utils/authPortable.js';
import { getCustomApiKeyStatus } from '../utils/config.js';
import { env } from '../utils/env.js';
import { isRunningOnHomespace } from '../utils/envUtils.js';
import { PreflightStep } from '../utils/preflightChecks.js';
import type { ThemeSetting } from '../utils/theme.js';
import { ApproveApiKey } from './ApproveApiKey.js';
import { ConsoleOAuthFlow } from './ConsoleOAuthFlow.js';
import { Select } from './CustomSelect/select.js';
import { WelcomeV2 } from './LogoV2/WelcomeV2.js';
import { PressEnterToContinue } from './PressEnterToContinue.js';
import { ThemePicker } from './ThemePicker.js';
import { OrderedList } from './ui/OrderedList.js';

type StepId = 'preflight' | 'theme' | 'provider' | 'oauth' | 'api-key' | 'commands' | 'security' | 'terminal-setup';

interface OnboardingStep {
  id: StepId;
  component: React.ReactNode;
}

type Props = {
  onDone(): void;
};

const PROVIDER_DESCRIPTIONS: Record<string, { description: string; highlight: string }> = {
  anthropic: {
    description: 'Official Claude models with best-in-class coding capabilities',
    highlight: 'Recommended for most users',
  },
  openai: {
    description: 'GPT-4o and o-series models with strong general-purpose intelligence',
    highlight: 'Great for diverse tasks',
  },
  google: {
    description: 'Gemini models with large context windows and multimodal support',
    highlight: 'Best for large contexts',
  },
  deepseek: {
    description: 'DeepSeek V4 with competitive performance and pricing',
    highlight: 'Cost-effective option',
  },
  openrouter: {
    description: 'Unified access to multiple providers through a single API',
    highlight: 'Flexible multi-model access',
  },
  opencode: {
    description: 'Open-source model hosting with transparent pricing',
    highlight: 'Open-source friendly',
  },
  ollama: {
    description: 'Run models locally on your machine — no cloud dependency',
    highlight: 'Fully offline capable',
  },
};

function ProviderIntroContent({ onSelect }: { onSelect: (provider: string) => void }) {
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>Choose your AI provider. Each offers different models and capabilities:</Text>
      </Box>
      <Select
        options={[
          { label: 'Anthropic Claude', value: 'anthropic' },
          { label: 'OpenAI', value: 'openai' },
          { label: 'Google Gemini', value: 'google' },
          { label: 'DeepSeek', value: 'deepseek' },
          { label: 'OpenRouter', value: 'openrouter' },
          { label: 'OpenCode', value: 'opencode' },
          { label: 'Ollama (Local)', value: 'ollama' },
        ]}
        onChange={onSelect}
        onCancel={() => {}}
      />
      <Box flexDirection="column" gap={0} marginTop={1}>
        <Text bold color="claude">
          Provider overview:
        </Text>
        <Box flexDirection="column" gap={0} marginTop={0}>
          {(['anthropic', 'openai', 'google', 'deepseek', 'openrouter', 'opencode', 'ollama'] as const).map(id => {
            const info = PROVIDER_DESCRIPTIONS[id];
            return (
              <Box key={id} flexDirection="column" paddingLeft={1} marginTop={0}>
                <Text>
                  <Text bold>
                    {id === 'anthropic'
                      ? 'Claude'
                      : id === 'openai'
                        ? 'OpenAI'
                        : id === 'google'
                          ? 'Gemini'
                          : id === 'deepseek'
                            ? 'DeepSeek'
                            : id === 'openrouter'
                              ? 'OpenRouter'
                              : id === 'opencode'
                                ? 'OpenCode'
                                : 'Ollama'}
                  </Text>
                  <Text dimColor> — {info.description}</Text>
                </Text>
                <Text dimColor italic>
                  {info.highlight}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

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
  const [skipOAuth, setSkipOAuth] = useState(false);
  const [oauthEnabled] = useState(() => isAnthropicAuthEnabled());
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    logEvent('tengu_began_setup', {
      oauthEnabled,
    });
  }, [oauthEnabled]);

  function goToNextStep() {
    if (currentStepIndex < steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);

      logEvent('tengu_onboarding_step', {
        oauthEnabled,
        stepId: steps[nextIndex]?.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
    } else {
      onDone();
    }
  }

  function handleThemeSelection(newTheme: ThemeSetting) {
    setTheme(newTheme);
    goToNextStep();
  }

  const exitState = useExitOnCtrlCDWithKeybindings();

  // Define all onboarding steps
  const themeStep = (
    <Box marginX={1}>
      <ThemePicker
        onThemeSelect={handleThemeSelection}
        showIntroText={true}
        helpText="To change this later, run /theme"
        hideEscToCancel={true}
        skipExitHandling={true} // Skip exit handling as Onboarding already handles it
      />
    </Box>
  );

  const securityStep = (() => {
    let name = 'AI';
    let docUrl = 'https://code.claude.com/docs/en/security';
    try {
      const { ProviderManager } = require('../services/ai/ProviderManager.js');
      const activeProvider = ProviderManager.getInstance().getActiveProviderName();
      if (activeProvider === 'anthropic') {
        name = 'Claude';
        docUrl = 'https://code.claude.com/docs/en/security';
      } else if (activeProvider === 'openai') {
        name = 'ChatGPT';
        docUrl = 'https://openai.com/policies/sharing-publication-policy/';
      } else if (activeProvider === 'gemini') {
        name = 'Gemini';
        docUrl = 'https://support.google.com/gemini/answer/13594961';
      } else if (activeProvider === 'ollama') {
        name = 'Ollama';
        docUrl = 'https://ollama.com/';
      }
    } catch {}

    return (
      <Box flexDirection="column" gap={1} paddingLeft={1}>
        <Text bold>Security notes:</Text>
        <Box flexDirection="column" width={70}>
          <OrderedList>
            <OrderedList.Item>
              <Text>{name} can make mistakes</Text>
              <Text dimColor wrap="wrap">
                You should always review {name}&apos;s responses, especially when
                <Newline />
                running code.
                <Newline />
              </Text>
            </OrderedList.Item>
            <OrderedList.Item>
              <Text>Due to prompt injection risks, only use it with code you trust</Text>
              <Text dimColor wrap="wrap">
                For more details see:
                <Newline />
                <Link url={docUrl} />
              </Text>
            </OrderedList.Item>
          </OrderedList>
        </Box>
        <PressEnterToContinue />
      </Box>
    );
  })();

  const preflightStep = <PreflightStep onSuccess={goToNextStep} />;
  // Create the steps array - determine which steps to include based on reAuth and oauthEnabled
  const apiKeyNeedingApproval = useMemo(() => {
    // Add API key step if needed
    // On homespace, ANTHROPIC_API_KEY is preserved in process.env for child
    // processes but ignored by Clew Code itself (see auth.ts).
    if (!process.env.ANTHROPIC_API_KEY || isRunningOnHomespace()) {
      return '';
    }
    const customApiKeyTruncated = normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY);
    if (getCustomApiKeyStatus(customApiKeyTruncated) === 'new') {
      return customApiKeyTruncated;
    }
  }, []);

  function handleApiKeyDone(approved: boolean) {
    if (approved) {
      setSkipOAuth(true);
    }
    goToNextStep();
  }

  const steps: OnboardingStep[] = [];
  if (oauthEnabled) {
    steps.push({ id: 'preflight', component: preflightStep });
  }
  steps.push({ id: 'theme', component: themeStep });

  // Add provider introduction step with interactive selection
  const providerStep = (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      <Text bold>AI Provider</Text>
      <Box flexDirection="column" width={70} gap={1}>
        <Box flexDirection="column" borderTop borderStyle="dashed" borderColor="subtle" paddingTop={1}>
          <ProviderIntroContent
            onSelect={(provider: string) => {
              try {
                const pm = ProviderManager.getInstance();
                const cfg = pm.getSelectedProviderConfig(true);
                pm.saveSelectedProviderConfig({ ...cfg, provider: provider as ProviderId });
              } catch {}
              goToNextStep();
            }}
          />
        </Box>
      </Box>
    </Box>
  );
  steps.push({ id: 'provider', component: providerStep });

  if (apiKeyNeedingApproval) {
    steps.push({
      id: 'api-key',
      component: <ApproveApiKey customApiKeyTruncated={apiKeyNeedingApproval} onDone={handleApiKeyDone} />,
    });
  }

  if (oauthEnabled) {
    steps.push({
      id: 'oauth',
      component: (
        <SkippableStep skip={skipOAuth} onSkip={goToNextStep}>
          <ConsoleOAuthFlow onDone={goToNextStep} />
        </SkippableStep>
      ),
    });
  }

  // Add quick commands reference step
  const commandsStep = <QuickCommandsContent />;
  steps.push({ id: 'commands', component: commandsStep });

  steps.push({ id: 'security', component: securityStep });

  if (shouldOfferTerminalSetup()) {
    steps.push({
      id: 'terminal-setup',
      component: (
        <Box flexDirection="column" gap={1} paddingLeft={1}>
          <Text bold>Use Clew Code&apos;s terminal setup?</Text>
          <Box flexDirection="column" width={70} gap={1}>
            <Text>
              For the optimal coding experience, enable the recommended settings
              <Newline />
              for your terminal:{' '}
              {env.terminal === 'Apple_Terminal'
                ? 'Option+Enter for newlines and visual bell'
                : 'Shift+Enter for newlines'}
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
                  // Errors already logged in setupTerminal, just swallow and proceed
                  void setupTerminal(theme)
                    .catch(() => {})
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
      ),
    });
  }

  const currentStep = steps[currentStepIndex];

  // Handle Enter on security step and Escape on terminal-setup step
  // Dependencies match what goToNextStep uses internally
  const handleSecurityContinue = useCallback(() => {
    if (currentStepIndex === steps.length - 1) {
      onDone();
    } else {
      goToNextStep();
    }
  }, [currentStepIndex, steps.length, oauthEnabled, onDone]);

  const handleTerminalSetupSkip = useCallback(() => {
    goToNextStep();
  }, [currentStepIndex, steps.length, oauthEnabled, onDone]);

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

  const totalSteps = steps.length;
  const showProgress = totalSteps > 1;

  return (
    <Box flexDirection="column">
      <WelcomeV2 />
      <Box flexDirection="column" marginTop={1}>
        {/* Step progress indicator */}
        {showProgress && (
          <Box paddingLeft={1} marginBottom={1}>
            <Text dimColor>
              Step {currentStepIndex + 1} of {totalSteps}
            </Text>
          </Box>
        )}
        {currentStep?.component}
        {exitState.pending && (
          <Box padding={1}>
            <Text dimColor>Press {exitState.keyName} again to exit</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function SkippableStep({
  skip,
  onSkip,
  children,
}: {
  skip: boolean;
  onSkip(): void;
  children: React.ReactNode;
}): React.ReactNode {
  useEffect(() => {
    if (skip) {
      onSkip();
    }
  }, [skip, onSkip]);
  if (skip) {
    return null;
  }
  return children;
}
