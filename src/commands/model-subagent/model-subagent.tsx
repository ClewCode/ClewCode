import ansis from 'ansis';
import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { ModelPicker } from '../../components/ModelPicker.js';
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { parseUserSpecifiedModel, renderModelName } from '../../utils/model/model.js';
import { isModelAllowed } from '../../utils/model/modelAllowlist.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';

function renderSubagentModelLabel(model: string | null | undefined): string {
  if (!model) {
    return 'Inherit from parent';
  }
  if (model.includes('/')) {
    return model;
  }
  return renderModelName(parseUserSpecifiedModel(model), undefined, 'short');
}

function ModelPickerWrapper({
  onDone,
}: {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const subagentModel = useAppState(s => s.settings.subagentModel ?? null);
  const setAppState = useSetAppState();

  function handleCancel(): void {
    onDone(`Kept subagent default as ${ansis.bold(renderSubagentModelLabel(subagentModel))}`, {
      display: 'system',
    });
  }

  function handleSelect(modelInput: string | null): void {
    const result = updateSettingsForSource('userSettings', {
      subagentModel: modelInput ?? undefined,
    });
    if (result.error) {
      onDone(`Failed to set subagent model: ${result.error.message}`, {
        display: 'system',
      });
      return;
    }

    setAppState(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        subagentModel: modelInput ?? undefined,
      },
    }));

    onDone(
      modelInput
        ? `Set subagent default to ${ansis.bold(renderSubagentModelLabel(modelInput))}`
        : 'Set subagent default to inherit from parent',
    );
  }

  return (
    <ModelPicker
      initial={subagentModel}
      onSetDefault={handleSelect}
      onCancel={handleCancel}
      isStandaloneCommand
      headerText="Choose the default model for Agent subagents."
      defaultOptionLabel="Inherit from parent"
      defaultOptionDescription="Use the parent conversation model for subagents"
    />
  );
}

function SetModelAndClose({
  args,
  onDone,
}: {
  args: string;
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
}): React.ReactNode {
  const setAppState = useSetAppState();

  React.useEffect(() => {
    const normalized = args.trim();
    const model = normalized === 'default' || normalized === 'inherit' || normalized === 'unset' ? null : normalized;

    if (model && !isModelAllowed(model)) {
      onDone(`Model '${model}' is not available. Your organization restricts model selection.`, {
        display: 'system',
      });
      return;
    }

    const result = updateSettingsForSource('userSettings', {
      subagentModel: model ?? undefined,
    });
    if (result.error) {
      onDone(`Failed to set subagent model: ${result.error.message}`, {
        display: 'system',
      });
      return;
    }

    setAppState(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        subagentModel: model ?? undefined,
      },
    }));

    onDone(
      model
        ? `Set subagent default to ${ansis.bold(renderSubagentModelLabel(model))}`
        : 'Set subagent default to inherit from parent',
    );
  }, [args, onDone, setAppState]);

  return null;
}

function ShowCurrentSubagentModel({ onDone }: { onDone: (result: string) => void }): React.ReactNode {
  const subagentModel = useAppState(s => s.settings.subagentModel ?? null);

  React.useEffect(() => {
    onDone(`Current subagent default: ${ansis.bold(renderSubagentModelLabel(subagentModel))}`);
  }, [onDone, subagentModel]);

  return null;
}

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  args = args?.trim() || '';

  if (COMMON_INFO_ARGS.includes(args)) {
    return <ShowCurrentSubagentModel onDone={onDone} />;
  }

  if (COMMON_HELP_ARGS.includes(args)) {
    onDone(
      'Run /modelsubagent to open the subagent model picker, or /modelsubagent [model] to set the default for Agent subagents.',
      {
        display: 'system',
      },
    );
    return;
  }

  if (args) {
    return <SetModelAndClose args={args} onDone={onDone} />;
  }

  return <ModelPickerWrapper onDone={onDone} />;
};
