import * as React from 'react';
import { ConsoleOAuthFlow } from '../../components/ConsoleOAuthFlow.js';
import { Select } from '../../components/CustomSelect/select.js';
import { ModelPicker } from '../../components/ModelPicker.js';
import { OpenAIOAuthFlow } from '../../components/OpenAIOAuthFlow.js';
import TextInput from '../../components/TextInput.js';
import { ThemePicker } from '../../components/ThemePicker.js';
import {
  useWizard,
  WizardDialogLayout,
  WizardNavigationFooter,
  WizardProvider,
} from '../../components/wizard/index.js';
import { Box, Text, useTheme } from '../../ink.js';
import { completeOnboarding } from '../../interactiveHelpers.js';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import type { ProviderId } from '../../services/ai/providers/ProviderInterface.js';
import { useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import type { ThemeSetting } from '../../utils/theme.js';
import { setupTerminal } from '../terminalSetup/terminalSetup.js';

type OnboardingData = {
  theme?: ThemeSetting;
  provider?: string;
  authMethod?: 'oauth' | 'apikey';
  apiKey?: string;
  model?: string;
  terminalSetup?: boolean;
};

export function OnboardingDialog({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const setAppState = useSetAppState();
  const [currentTheme] = useTheme();

  const steps = [
    // Step 1: Select Theme
    function ThemeStep() {
      const handleThemeSelect = (newTheme: ThemeSetting) => {
        completeOnboarding(); // Mark onboarding as completed to persist theme choice
        onDone(`Theme set to ${newTheme}`, { display: 'system' });
      };

      return (
        <WizardDialogLayout title="Visual Style" subtitle="Choose your preferred terminal theme">
          <ThemePicker
            onThemeSelect={handleThemeSelect}
            showIntroText={false}
            helpText="Use arrow keys to select, Enter to confirm"
            hideEscToCancel={true}
            skipExitHandling={true}
          />
        </WizardDialogLayout>
      );
    },

    // Step 2: Select AI Provider
    function ProviderStep() {
      const { updateWizardData, goNext } = useWizard<OnboardingData>();

      const handleSelect = (provider: string) => {
        updateWizardData({ provider });
        try {
          const pm = ProviderManager.getInstance();
          const cfg = pm.getSelectedProviderConfig(true);
          pm.saveSelectedProviderConfig({ ...cfg, provider: provider as ProviderId });
        } catch {}
        goNext();
      };

      return (
        <WizardDialogLayout title="AI Provider" subtitle="Select your preferred AI service provider">
          <Select
            options={[
              { label: 'Anthropic Claude (Official)', value: 'anthropic' },
              { label: 'OpenAI GPT (ChatGPT)', value: 'openai' },
              { label: 'Google Gemini', value: 'google' },
              { label: 'DeepSeek V4 (moe)', value: 'deepseek' },
              { label: 'OpenRouter AI', value: 'openrouter' },
              { label: 'OpenCode AI', value: 'opencode' },
              { label: 'Ollama (Local)', value: 'ollama' },
            ]}
            onChange={handleSelect}
            onCancel={() => {}}
          />
        </WizardDialogLayout>
      );
    },

    // Step 3: Select Authentication Method
    function AuthMethodStep() {
      const { wizardData, updateWizardData, goNext, goBack } = useWizard<OnboardingData>();
      const provider = wizardData.provider || 'anthropic';

      React.useEffect(() => {
        if (provider === 'ollama') {
          goNext();
        } else if (provider !== 'anthropic' && provider !== 'openai') {
          updateWizardData({ authMethod: 'apikey' });
          goNext();
        }
      }, [provider, updateWizardData, goNext]);

      if (provider === 'ollama' || (provider !== 'anthropic' && provider !== 'openai')) {
        return null;
      }

      const handleSelect = (method: 'oauth' | 'apikey') => {
        updateWizardData({ authMethod: method });
        goNext();
      };

      return (
        <WizardDialogLayout
          title="Authentication"
          subtitle={`Choose login method for ${provider === 'openai' ? 'OpenAI' : 'Anthropic'}`}
        >
          <Select
            options={[
              { label: 'Browser Login (OAuth / Subscription)', value: 'oauth' },
              { label: 'Direct API Key', value: 'apikey' },
            ]}
            onChange={value => handleSelect(value as 'oauth' | 'apikey')}
            onCancel={goBack}
          />
        </WizardDialogLayout>
      );
    },

    // Step 4: Authentication Execution
    function AuthExecuteStep() {
      const { wizardData, goNext, goBack } = useWizard<OnboardingData>();
      const provider = wizardData.provider || 'anthropic';
      const method = wizardData.authMethod;
      const [apiKeyInput, setApiKeyInput] = React.useState('');
      const [cursorOffset, setCursorOffset] = React.useState(0);

      if (provider === 'ollama') {
        return null;
      }

      const handleOAuthDone = () => {
        goNext();
      };

      const handleApiKeySubmit = (value: string) => {
        if (value.trim()) {
          try {
            const pm = ProviderManager.getInstance();
            const cfg = pm.getSelectedProviderConfig(true);
            const apiKeys = { ...cfg.apiKeys, [provider]: value.trim() };
            pm.saveSelectedProviderConfig({ ...cfg, apiKeys });
          } catch {}
          goNext();
        }
      };

      if (method === 'oauth') {
        if (provider === 'anthropic') {
          return (
            <WizardDialogLayout title="Anthropic Login" subtitle="Authenticate with Anthropic Console">
              <ConsoleOAuthFlow onDone={handleOAuthDone} />
            </WizardDialogLayout>
          );
        }
        if (provider === 'openai') {
          return (
            <WizardDialogLayout title="OpenAI Login" subtitle="Authenticate with OpenAI">
              <OpenAIOAuthFlow onDone={handleOAuthDone} onCancel={goBack} />
            </WizardDialogLayout>
          );
        }
      }

      let envVarName = 'API_KEY';
      try {
        const pm = ProviderManager.getInstance();
        const pInstance = pm.getProvider(provider as ProviderId);
        envVarName = pInstance.getProviderApiKeyEnvVar();
      } catch {
        envVarName = `${provider.toUpperCase()}_API_KEY`;
      }

      return (
        <WizardDialogLayout title="API Key Setup" subtitle={`Enter your ${envVarName} key`}>
          <Box flexDirection="column" gap={1}>
            <Text>Paste or type your key below and press Enter to save:</Text>
            <Box borderStyle="round" paddingX={1} width={60}>
              <TextInput
                value={apiKeyInput}
                onChange={value => {
                  setApiKeyInput(value);
                  setCursorOffset(value.length);
                }}
                onSubmit={handleApiKeySubmit}
                columns={56}
                cursorOffset={cursorOffset}
                onChangeCursorOffset={setCursorOffset}
              />
            </Box>
            <Text dimColor>To go back, press Esc</Text>
          </Box>
        </WizardDialogLayout>
      );
    },

    // Step 5: Select AI Model
    function ModelStep() {
      const pm = ProviderManager.getInstance();
      const activeModel = pm.getModelForProvider();

      const handleModelSelect = (model: string | null, _effort: any, _options?: { persistAsDefault?: boolean }) => {
        if (model) {
          setAppState(prev => ({
            ...prev,
            mainLoopModel: model,
            mainLoopModelForSession: null,
          }));
          try {
            const cfg = pm.getSelectedProviderConfig(true);
            pm.saveSelectedProviderConfig({ ...cfg, model });
          } catch {}
        }
      };

      return (
        <WizardDialogLayout title="AI Config" subtitle="Select your preferred AI model">
          <ModelPicker
            initial={activeModel}
            onSelect={handleModelSelect}
            onSetDefault={(model: string | null) => handleModelSelect(model, undefined, { persistAsDefault: true })}
            onCancel={() => {}}
            isStandaloneCommand={true}
            showFastModeNotice={false}
          />
          <WizardNavigationFooter />
        </WizardDialogLayout>
      );
    },

    // Step 6: Terminal Optimization
    function TerminalStep() {
      return (
        <WizardDialogLayout
          title="Terminal Settings"
          subtitle="Configure recommended keybindings for optimal experience"
        >
          <Box flexDirection="column" gap={1}>
            <Text>For the best code editing experience, enable terminal integration:</Text>
            <Text dimColor>• Shift+Enter for clean newlines in prompt inputs</Text>
            <Text dimColor>• Support for key modifiers and visual bell notifications</Text>

            <Box marginTop={1}>
              <Select
                options={[
                  { label: 'Yes, apply recommended terminal settings', value: 'apply' },
                  { label: 'No, skip for now', value: 'skip' },
                ]}
                onChange={async value => {
                  if (value === 'apply') {
                    try {
                      await setupTerminal(currentTheme);
                    } catch {}
                  }
                }}
                onCancel={() => {}}
              />
            </Box>
          </Box>
          <WizardNavigationFooter />
        </WizardDialogLayout>
      );
    },
  ];

  const handleComplete = (_data: OnboardingData) => {
    completeOnboarding();
    onDone('Onboarding completed successfully! You are all set to code with Antigravity.', { display: 'system' });
  };

  return (
    <WizardProvider
      title="Clew Code Setup Wizard"
      steps={steps}
      onComplete={handleComplete}
      onCancel={() => onDone('Setup wizard exited', { display: 'system' })}
    />
  );
}

export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  return <OnboardingDialog onDone={onDone} />;
}
