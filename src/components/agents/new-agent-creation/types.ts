import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js';
import type { AgentMemoryScope } from '../../../tools/AgentTool/agentMemory.js';
import type { CustomAgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js';
// @ts-expect-error
import type { SettingSource } from '../../../utils/settings/settings.js';

/**
 * Data collected across the create-agent wizard steps. Each step writes its
 * slice through `updateWizardData`; the final ConfirmStepWrapper assembles a
 * full CustomAgentDefinition from `finalAgent` plus the other collected
 * fields.
 */
export type AgentWizardData = {
  // LocationStep — where the agent will be saved
  location?: SettingSource;
  // MethodStep — generate from a description vs fill in manually
  method?: 'generate' | 'manual';
  // GenerateStep — free-text description used to produce an agent
  generationPrompt?: string;
  isGenerating?: boolean;
  generatedAgent?: { identifier: string; whenToUse: string; systemPrompt: string };
  wasGenerated?: boolean;
  // TypeStep / PromptStep / DescriptionStep — manual fields
  agentType?: string;
  systemPrompt?: string;
  whenToUse?: string;
  // ToolsStep — tool selection
  selectedTools?: string[];
  // ModelStep — model override
  selectedModel?: string;
  // ColorStep — color accent
  selectedColor?: string;
  // MemoryStep — persistent memory scope
  selectedMemory?: AgentMemoryScope;
  // Assembled agent, ready for confirmation
  finalAgent?: CustomAgentDefinition & {
    color?: AgentColorName;
    memory?: AgentMemoryScope;
  };
};
