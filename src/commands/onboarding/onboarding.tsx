import * as React from 'react';
import { Select } from '../../components/CustomSelect/select.js';
import { ModelPicker } from '../../components/ModelPicker.js';
import TextInput from '../../components/TextInput.js';
import { ThemePicker } from '../../components/ThemePicker.js';
import {
  useWizard,
  WizardDialogLayout,
  WizardNavigationFooter,
  WizardProvider,
} from '../../components/wizard/index.js';
import { Box, Text } from '../../ink.js';
import { completeOnboarding } from '../../interactiveHelpers.js';
import { ProviderManager } from '../../services/ai/ProviderManager.js';
import type { ProviderId } from '../../services/ai/providers/ProviderInterface.js';
import { useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import type { ThemeSetting } from '../../utils/theme.js';

const PROVIDERS: { label: string; value: string }[] = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Google Gemini', value: 'google' },
  { label: 'Gemini Code Assist (OAuth)', value: 'google-assist' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Groq', value: 'groq' },
  { label: 'xAI (Grok)', value: 'xai' },
  { label: 'Mistral', value: 'mistral' },
  { label: 'Cohere', value: 'cohere' },
  { label: 'Perplexity', value: 'perplexity' },
  { label: 'Cerebras', value: 'cerebras' },
  { label: 'Moonshot AI (Kimi)', value: 'moonshot' },
  { label: 'Zhipu AI (GLM)', value: 'zhipu' },
  { label: 'NVIDIA NIM', value: 'nvidia' },
  { label: 'OpenRouter', value: 'openrouter' },
  { label: 'OpenCode', value: 'opencode' },
  { label: 'OpenCode Go', value: 'opencode-go' },
  { label: 'KiloCode', value: 'kilocode' },
  { label: 'Ollama (Local)', value: 'ollama' },
  { label: 'Together AI', value: 'together' },
  { label: 'Fireworks AI', value: 'fireworks' },
  { label: 'Deep Infra', value: 'deepinfra' },
  { label: 'SiliconFlow', value: 'siliconflow' },
  { label: 'Hugging Face', value: 'huggingface' },
  { label: 'Poe', value: 'poe' },
  { label: 'DigitalOcean', value: 'digitalocean' },
  { label: 'Cline', value: 'cline' },
  { label: 'Custom (OpenAI-Compatible)', value: 'custom' },
];

type OnboardingData = {
  theme?: ThemeSetting;
  provider?: string;
  apiKey?: string;
  model?: string;
};

export function OnboardingDialog({ onDone }: { onDone: LocalJSXCommandOnDone }) {
  const setAppState = useSetAppState();

  const steps = [
    // Step 1: Select Theme
    function ThemeStep() {
      const handleThemeSelect = (newTheme: ThemeSetting) => {
        completeOnboarding();
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
          <Select options={PROVIDERS} onChange={handleSelect} onCancel={() => {}} />
        </WizardDialogLayout>
      );
    },

    // Step 3: API Key Setup (skipped for Ollama — local-only, no key needed)
    function ApiKeyStep() {
      const { wizardData, updateWizardData, goNext, goBack } = useWizard<OnboardingData>();
      const provider = wizardData.provider || 'openai';
      const [apiKeyInput, setApiKeyInput] = React.useState('');
      const [cursorOffset, setCursorOffset] = React.useState(0);

      // Ollama doesn't need an API key — skip this step
      if (provider === 'ollama') {
        return null;
      }

      const handleSubmit = (value: string) => {
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

      let envVarName = 'API_KEY';
      try {
        const pm = ProviderManager.getInstance();
        const pInstance = pm.getProvider(provider as ProviderId);
        envVarName = pInstance.getProviderApiKeyEnvVar();
      } catch {
        envVarName = `${provider.toUpperCase()}_API_KEY`;
      }

      return (
        <WizardDialogLayout title="API Key" subtitle={`Enter your ${envVarName}`}>
          <Box flexDirection="column" gap={1}>
            <Text>Paste or type your API key below and press Enter to save:</Text>
            <Box borderStyle="round" paddingX={1} width={60}>
              <TextInput
                value={apiKeyInput}
                onChange={value => {
                  setApiKeyInput(value);
                  setCursorOffset(value.length);
                }}
                onSubmit={handleSubmit}
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

    // Step 4: Select AI Model
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
        <WizardDialogLayout title="AI Model" subtitle="Select your preferred AI model">
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
  ];

  const handleComplete = (_data: OnboardingData) => {
    completeOnboarding();
    onDone('Onboarding completed! You are ready to use Clew Code.', { display: 'system' });
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
