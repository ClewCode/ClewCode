import { basename } from 'path';
import type * as React from 'react';
import { useMemo, useState } from 'react';
import { getOriginalCwd, setScheduledTasksEnabled } from '../../bootstrap/state.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import TextInput from '../../components/TextInput.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text, useInput } from '../../ink.js';
import { isDurableCronEnabled } from '../../tools/ScheduleCronTool/prompt.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { cronToHuman, parseCronExpression } from '../../utils/cron.js';
import { addCronTask, nextCronRunMs } from '../../utils/cronTasks.js';

type ScheduleKind = 'daily' | 'weekdays' | 'hourly' | 'every-minutes' | 'one-shot' | 'custom';
type FocusKey = 'name' | 'kind' | 'time' | 'prompt' | 'durable' | 'create';

const FOCUS_ORDER: FocusKey[] = ['name', 'kind', 'time', 'prompt', 'durable', 'create'];
const SCHEDULE_KINDS: Array<{ value: ScheduleKind; label: string; hint: string }> = [
  { value: 'daily', label: 'Daily', hint: 'runs every day at the selected local time' },
  { value: 'weekdays', label: 'Weekdays', hint: 'runs Monday-Friday at the selected local time' },
  { value: 'hourly', label: 'Hourly', hint: 'runs every hour at the selected minute' },
  { value: 'every-minutes', label: 'Every N minutes', hint: 'runs repeatedly at the selected interval' },
  { value: 'one-shot', label: 'In N minutes', hint: 'runs once, then deletes itself' },
  { value: 'custom', label: 'Custom cron', hint: 'uses a standard 5-field cron expression' },
];

function clampIndex(index: number): number {
  return Math.max(0, Math.min(index, FOCUS_ORDER.length - 1));
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number.parseInt(match[1]!, 10);
  const minute = Number.parseInt(match[2]!, 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function parsePositiveInt(value: string): number | null {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function buildCron(kind: ScheduleKind, rawValue: string): { cron: string; recurring: boolean; error?: string } {
  const value = rawValue.trim();
  switch (kind) {
    case 'daily': {
      const time = parseTime(value);
      if (!time) return { cron: '', recurring: true, error: 'Use HH:MM, for example 09:00.' };
      return { cron: `${time.minute} ${time.hour} * * *`, recurring: true };
    }
    case 'weekdays': {
      const time = parseTime(value);
      if (!time) return { cron: '', recurring: true, error: 'Use HH:MM, for example 09:00.' };
      return { cron: `${time.minute} ${time.hour} * * 1-5`, recurring: true };
    }
    case 'hourly': {
      const minute = Number.parseInt(value, 10);
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        return { cron: '', recurring: true, error: 'Use a minute from 0 to 59.' };
      }
      return { cron: `${minute} * * * *`, recurring: true };
    }
    case 'every-minutes': {
      const minutes = parsePositiveInt(value);
      if (!minutes || minutes > 59) return { cron: '', recurring: true, error: 'Use an interval from 1 to 59.' };
      return { cron: `*/${minutes} * * * *`, recurring: true };
    }
    case 'one-shot': {
      const minutes = parsePositiveInt(value);
      if (!minutes) return { cron: '', recurring: false, error: 'Use a positive number of minutes.' };
      const target = new Date(Date.now() + minutes * 60_000);
      return {
        cron: `${target.getMinutes()} ${target.getHours()} ${target.getDate()} ${target.getMonth() + 1} *`,
        recurring: false,
      };
    }
    case 'custom':
      return { cron: value, recurring: true };
  }
}

function valuePlaceholder(kind: ScheduleKind): string {
  switch (kind) {
    case 'daily':
    case 'weekdays':
      return '09:00';
    case 'hourly':
      return '7';
    case 'every-minutes':
      return '15';
    case 'one-shot':
      return '10';
    case 'custom':
      return '0 20 * * *';
  }
}

function valueLabel(kind: ScheduleKind): string {
  switch (kind) {
    case 'daily':
    case 'weekdays':
      return 'Time';
    case 'hourly':
      return 'Minute';
    case 'every-minutes':
      return 'Interval';
    case 'one-shot':
      return 'Delay';
    case 'custom':
      return 'Cron';
  }
}

function isTextFocus(focus: FocusKey): boolean {
  return focus === 'name' || focus === 'time' || focus === 'prompt';
}

function FieldLabel({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  return (
    <Text color={focused ? 'suggestion' : undefined} bold>
      {focused ? '> ' : '  '}
      {children}
    </Text>
  );
}

function InlineInput({
  focused,
  value,
  placeholder,
  onChange,
  onSubmit,
  multiline = false,
  columns,
}: {
  focused: boolean;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  multiline?: boolean;
  columns: number;
}) {
  const [cursorOffset, setCursorOffset] = useState(value.length);
  return (
    <Box borderStyle="round" borderColor={focused ? 'suggestion' : undefined} borderDimColor={!focused} paddingX={1}>
      <TextInput
        value={value}
        onChange={next => {
          onChange(next);
          setCursorOffset(Math.min(next.length, cursorOffset + Math.max(0, next.length - value.length)));
        }}
        onSubmit={onSubmit}
        onExit={onSubmit}
        placeholder={placeholder}
        focus={focused}
        showCursor={focused}
        multiline={multiline}
        columns={columns}
        maxVisibleLines={multiline ? 5 : 1}
        cursorOffset={Math.min(cursorOffset, value.length)}
        onChangeCursorOffset={setCursorOffset}
      />
    </Box>
  );
}

export function ScheduledTaskForm({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const { columns } = useTerminalSize();
  const projectName = basename(getOriginalCwd());
  const durableAvailable = isDurableCronEnabled();
  const [focusIndex, setFocusIndex] = useState(0);
  const focus = FOCUS_ORDER[clampIndex(focusIndex)]!;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ScheduleKind>('daily');
  const [scheduleValue, setScheduleValue] = useState('09:00');
  const [prompt, setPrompt] = useState('');
  const [durable, setDurable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedKindIndex = SCHEDULE_KINDS.findIndex(k => k.value === kind);
  const selectedKind = SCHEDULE_KINDS[selectedKindIndex] ?? SCHEDULE_KINDS[0]!;
  const cronPreview = useMemo(() => buildCron(kind, scheduleValue), [kind, scheduleValue]);
  const humanPreview =
    cronPreview.cron && parseCronExpression(cronPreview.cron) ? cronToHuman(cronPreview.cron) : 'Not ready';

  const moveFocus = (delta: number) => {
    setError(null);
    setFocusIndex(i => clampIndex(i + delta));
  };

  const submit = async () => {
    const title = name.trim();
    const body = prompt.trim();
    if (!title) {
      setError('Name is required.');
      setFocusIndex(0);
      return;
    }
    if (!body) {
      setError('Prompt is required.');
      setFocusIndex(3);
      return;
    }
    const built = buildCron(kind, scheduleValue);
    if (built.error || !parseCronExpression(built.cron)) {
      setError(built.error ?? 'Invalid cron expression.');
      setFocusIndex(2);
      return;
    }
    if (nextCronRunMs(built.cron, Date.now()) === null) {
      setError('Cron does not match any calendar date in the next year.');
      setFocusIndex(2);
      return;
    }

    const taskPrompt = `${title}\n\n${body}`;
    const effectiveDurable = durable && durableAvailable;
    const id = await addCronTask(built.cron, taskPrompt, built.recurring, effectiveDurable);
    setScheduledTasksEnabled(true);
    onDone(
      [
        `Scheduled task ${id}`,
        `Schedule: ${cronToHuman(built.cron)} (${built.cron})`,
        `Type: ${built.recurring ? 'recurring' : 'one-shot'}`,
        `Storage: ${effectiveDurable ? '.clew/scheduled_tasks.json' : 'session-only'}`,
      ].join('\n'),
      { display: 'system' },
    );
  };

  useInput(
    (_input, key) => {
      if (key.escape) {
        onDone('Scheduled task unchanged.', { display: 'system' });
        return;
      }
      if (key.tab) {
        moveFocus(key.shift ? -1 : 1);
        return;
      }
      if (key.upArrow) {
        moveFocus(-1);
        return;
      }
      if (key.downArrow) {
        moveFocus(1);
        return;
      }
      if (focus === 'kind' && (key.leftArrow || key.rightArrow)) {
        const delta = key.leftArrow ? -1 : 1;
        const next = SCHEDULE_KINDS[(selectedKindIndex + delta + SCHEDULE_KINDS.length) % SCHEDULE_KINDS.length]!;
        setKind(next.value);
        setScheduleValue(valuePlaceholder(next.value));
        setError(null);
        return;
      }
      if (focus === 'durable' && (key.leftArrow || key.rightArrow || key.return)) {
        if (durableAvailable) setDurable(v => !v);
        setError(null);
        return;
      }
      if (focus === 'create' && key.return) {
        void submit();
      }
    },
    { isActive: true },
  );

  const inputColumns = Math.max(20, Math.min(90, columns - 8));

  return (
    <Dialog
      title="New Scheduled Task"
      subtitle="Use Tab or arrows to move. Use left/right on Schedule and Storage."
      onCancel={() => onDone('Scheduled task unchanged.', { display: 'system' })}
      hideInputGuide
      isCancelActive={!isTextFocus(focus)}
    >
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <FieldLabel focused={focus === 'name'}>Name</FieldLabel>
          <InlineInput
            focused={focus === 'name'}
            value={name}
            placeholder="Enter task name"
            onChange={setName}
            onSubmit={() => moveFocus(1)}
            columns={inputColumns}
          />
        </Box>

        <Box flexDirection="column">
          <Text bold> Project</Text>
          <Box borderStyle="round" borderDimColor paddingX={1}>
            <Text>{projectName || 'current project'}</Text>
          </Box>
        </Box>

        <Box flexDirection="column">
          <FieldLabel focused={focus === 'kind'}>Schedule</FieldLabel>
          <Box>
            <Text color={focus === 'kind' ? 'suggestion' : undefined}>
              {focus === 'kind' ? '< ' : '  '}
              {selectedKind.label}
              {focus === 'kind' ? ' >' : '  '}
            </Text>
            <Text dimColor> {selectedKind.hint}</Text>
          </Box>
        </Box>

        <Box flexDirection="column">
          <FieldLabel focused={focus === 'time'}>{valueLabel(kind)}</FieldLabel>
          <InlineInput
            focused={focus === 'time'}
            value={scheduleValue}
            placeholder={valuePlaceholder(kind)}
            onChange={setScheduleValue}
            onSubmit={() => moveFocus(1)}
            columns={inputColumns}
          />
          <Text dimColor>
            {'  '}
            {cronPreview.cron || valuePlaceholder(kind)}
            {' -> '}
            {humanPreview}
          </Text>
        </Box>

        <Box flexDirection="column">
          <FieldLabel focused={focus === 'prompt'}>Prompt</FieldLabel>
          <InlineInput
            focused={focus === 'prompt'}
            value={prompt}
            placeholder="Enter a prompt for the agent"
            onChange={setPrompt}
            onSubmit={() => moveFocus(1)}
            multiline
            columns={inputColumns}
          />
        </Box>

        <Box flexDirection="column">
          <FieldLabel focused={focus === 'durable'}>Storage</FieldLabel>
          <Box>
            <Text color={focus === 'durable' ? 'suggestion' : undefined}>{durable ? 'Durable' : 'Session-only'}</Text>
            <Text dimColor>
              {'  '}
              {durable ? 'saved to .clew/scheduled_tasks.json' : 'kept in memory until this session exits'}
            </Text>
          </Box>
          {!durableAvailable && <Text color="warning"> Durable scheduled tasks are disabled by the runtime gate.</Text>}
        </Box>

        {error && <Text color="error"> {error}</Text>}

        <Box justifyContent="flex-end">
          <Text dimColor>Esc cancel </Text>
          <Text color={focus === 'create' ? 'suggestion' : undefined} inverse={focus === 'create'}>
            {' '}
            Add Scheduled Task{' '}
          </Text>
        </Box>
      </Box>
    </Dialog>
  );
}
