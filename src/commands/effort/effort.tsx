import * as React from 'react';
import { useCallback, useState } from 'react';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { ClockContext } from '../../ink/components/ClockContext.js';
import { Box, Text, useAnimationTimer, useInput } from '../../ink.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import {
  type EffortValue,
  getDisplayedEffortLevel,
  getEffortEnvOverride,
  getEffortValueDescription,
  isEffortLevel,
  toPersistableEffort,
} from '../../utils/effort.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';

const COMMON_HELP_ARGS = ['help', '-h', '--help'];

// ─────────────────────────────────────────────────────────────────────────────
// Slider constants
// ─────────────────────────────────────────────────────────────────────────────

/** The 6 interactive levels shown in the slider. */
const SLIDER_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'] as const;
type SliderLevel = (typeof SLIDER_LEVELS)[number];

/** How many of those levels belong to the "standard" track (before the ┊). */
const STD_COUNT = 5; // low … max

// Purple panel animation. Keep this reasonably slow so the terminal does not flicker.
const GLOW_INTERVAL_MS = 120;

// ─────────────────────────────────────────────────────────────────────────────
// Core effort logic (preserved from original)
// ─────────────────────────────────────────────────────────────────────────────

type EffortCommandResult = {
  message: string;
  effortUpdate?: { value: EffortValue | undefined };
};

function setEffortValue(effortValue: EffortValue, ultracodeMode = false): EffortCommandResult {
  const persistable = toPersistableEffort(effortValue);
  if (persistable !== undefined) {
    const result = updateSettingsForSource('userSettings', {
      effortLevel: persistable,
    });
    if (result.error) {
      return {
        message: `Failed to set effort level: ${result.error.message}`,
      };
    }
  }
  logEvent('tengu_effort_command', {
    effort: (ultracodeMode ? 'ultracode' : effortValue) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });

  const envOverride = getEffortEnvOverride();
  if (envOverride !== undefined && envOverride !== effortValue) {
    const envRaw = process.env.CLEW_CODE_EFFORT_LEVEL;
    if (persistable === undefined) {
      return {
        message: `Not applied: CLEW_CODE_EFFORT_LEVEL=${envRaw} overrides effort this session, and ${effortValue} is session-only (nothing saved)`,
        effortUpdate: { value: effortValue },
      };
    }
    return {
      message: `CLEW_CODE_EFFORT_LEVEL=${envRaw} overrides this session — clear it and ${effortValue} takes over`,
      effortUpdate: { value: effortValue },
    };
  }

  const suffix = persistable !== undefined ? '' : ' (this session only)';
  if (ultracodeMode) {
    return {
      message: `ultracode · xhigh effort + dynamic workflows for maximum thoroughness${suffix}`,
      effortUpdate: { value: effortValue },
    };
  }
  const description = getEffortValueDescription(effortValue);
  return {
    message: `Set effort level to ${effortValue}${suffix}: ${description}`,
    effortUpdate: { value: effortValue },
  };
}

export function showCurrentEffort(appStateEffort: EffortValue | undefined, model: string): EffortCommandResult {
  const envOverride = getEffortEnvOverride();
  const effectiveValue = envOverride === null ? undefined : (envOverride ?? appStateEffort);
  if (effectiveValue === undefined) {
    const level = getDisplayedEffortLevel(model, appStateEffort);
    return { message: `Effort level: auto (currently ${level})` };
  }
  const description = getEffortValueDescription(effectiveValue);
  return {
    message: `Current effort level: ${effectiveValue} (${description})`,
  };
}

function unsetEffortLevel(): EffortCommandResult {
  const result = updateSettingsForSource('userSettings', {
    effortLevel: undefined,
  });
  if (result.error) {
    return {
      message: `Failed to set effort level: ${result.error.message}`,
    };
  }
  logEvent('tengu_effort_command', {
    effort: 'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });
  const envOverride = getEffortEnvOverride();
  if (envOverride !== undefined && envOverride !== null) {
    const envRaw = process.env.CLEW_CODE_EFFORT_LEVEL;
    return {
      message: `Cleared effort from settings, but CLEW_CODE_EFFORT_LEVEL=${envRaw} still controls this session`,
      effortUpdate: { value: undefined },
    };
  }
  return {
    message: 'Effort level set to auto',
    effortUpdate: { value: undefined },
  };
}

export function executeEffort(args: string): EffortCommandResult {
  const normalized = args.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'unset') {
    return unsetEffortLevel();
  }
  if (normalized === 'ultracode') {
    const result = setEffortValue('xhigh', true);
    try {
      const g = globalThis as { __appState?: { set?: (k: string, v: unknown) => void } };
      g.__appState?.set?.('ultracodeState', { enabled: true, confirmedOnce: true, workflowsStarted: 0 });
    } catch {
      /* ignore */
    }
    return result;
  }
  if (!isEffortLevel(normalized)) {
    return {
      message: `Invalid argument: ${args}. Valid options are: low, medium, high, xhigh, max, ultracode, auto`,
    };
  }
  return setEffortValue(normalized);
}

// ─────────────────────────────────────────────────────────────────────────────
// Character-exact slider renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build each rendered line as an array of {text, color?, bold?, dim?} spans.
 * This gives pixel-exact control over every column — no Ink flexbox surprises.
 */

type Span = { text: string; color?: string; bold?: boolean; dim?: boolean };

// Robust HSL to Hex helper for beautiful background colors
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Smooth easing for the ultracode reveal.
function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) ** 3;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Generates the expanding purple wave used only while ultracode is selected.
// The distance math compensates for terminal cell aspect ratio, so the first
// frame reads like a round ripple instead of a plus/cross shape. Undefined
// means "no background for this cell".
function computeExpandingPanelColors(
  totalWidth: number,
  row: number,
  animTime: number,
  progress: number,
  centerX: number,
  centerY: number,
): Array<string | undefined> {
  const eased = easeOutCubic(progress);
  const frame = Math.floor(animTime / GLOW_INTERVAL_MS);
  const colors: Array<string | undefined> = [];

  // Terminal cells are taller than they are wide. Scaling Y by ~2.15 makes the
  // ripple look circular in a monospaced terminal grid.
  const cellAspectY = 2.15;

  const initialRadius = 4;
  const finalRadius = Math.min(30, Math.max(18, totalWidth * 0.28));
  const radius = initialRadius + (finalRadius - initialRadius) * eased;

  // Keep ultracode as a soft radial spotlight instead of flooding the whole
  // panel. This reads better in terminals with coarse background cells.
  const feather = 7;
  const baseHue = 264 + Math.sin(frame * 0.04) * 3;
  const baseSat = 76 + Math.cos(frame * 0.05) * 3;

  for (let x = 0; x < totalWidth; x++) {
    const dx = x - centerX;
    const dy = (row - centerY) * cellAspectY;
    const dist = Math.hypot(dx, dy);

    if (dist > radius + feather) {
      colors.push(undefined);
      continue;
    }

    const inside = clampNumber((radius + feather - dist) / feather, 0, 1);
    const core = clampNumber((radius - dist) / Math.max(radius, 1), 0, 1);

    const wave = Math.sin(dist / 3.4 - frame * 0.045);
    const ring = Math.exp(-((dist - radius * 0.62) ** 2) / 36);

    const lightness = clampNumber(12 + inside * 7 + core * 12 + wave * 3 + ring * (8 + (1 - eased) * 4), 10, 34);

    colors.push(hslToHex(baseHue, baseSat, lightness));
  }

  return colors;
}

// Maps selected slider values to high-contrast colors
function getSelectedColor(level: SliderLevel): string {
  switch (level) {
    case 'low':
      return '#38bdf8'; // Cyan
    case 'medium':
      return '#4ade80'; // Green
    case 'high':
      return '#facc15'; // Yellow
    case 'xhigh':
      return '#f472b6'; // Magenta/Pink
    case 'max':
      return '#fb923c'; // Orange/Gold
    case 'ultracode':
      return '#ffffff'; // White (since background is purple)
    default:
      return '#ffffff';
  }
}

// Compute label alignments precisely to prevent overlaps and fit separator perfectly
function computeLayout(cols: number) {
  const ultraZoneWidth = Math.max(18, Math.floor(cols * 0.25));
  const stdZoneWidth = cols - ultraZoneWidth - 1; // -1 for ┊ separator

  const labelCols: number[] = [];

  // 'low' starts at 0
  labelCols.push(0);

  // Intermediate labels centered on their track positions
  for (let i = 1; i < STD_COUNT - 1; i++) {
    const trackPos = Math.round((i / (STD_COUNT - 1)) * (stdZoneWidth - 1));
    const labelLen = SLIDER_LEVELS[i]!.length;
    labelCols.push(Math.round(trackPos - labelLen / 2));
  }

  // 'max' right-aligned to stdZoneWidth boundary
  labelCols.push(stdZoneWidth - 'max'.length);

  // 'ultracode' centered in the ultra zone
  const ultraLabelCol = stdZoneWidth + 1 + Math.floor((ultraZoneWidth - 'ultracode'.length) / 2);
  labelCols.push(ultraLabelCol);

  return {
    stdZoneWidth,
    ultraZoneWidth,
    labelCols,
    sepCol: stdZoneWidth,
    totalWidth: cols,
  };
}

function getSliderIndexForCurrentEffort(appStateEffort: EffortValue | undefined, model: string): number {
  const envOverride = getEffortEnvOverride();
  const effectiveValue = envOverride === null ? undefined : (envOverride ?? appStateEffort);
  const displayedLevel = effectiveValue ?? getDisplayedEffortLevel(model, appStateEffort);
  const index = SLIDER_LEVELS.indexOf(displayedLevel as SliderLevel);

  return index >= 0 ? index : SLIDER_LEVELS.indexOf('medium');
}

function foregroundForPanelCell(color: string | undefined, occupied: boolean): string | undefined {
  if (color) return color;
  return occupied ? '#ffffff' : undefined;
}

// Renders one formatted line padded to totalWidth with a real Ink background panel.
function renderLineWithPanel(
  spans: Span[],
  totalWidth: number,
  panelColors: Array<string | undefined>,
): React.ReactNode {
  const cells = Array.from({ length: totalWidth }, () => ({
    ch: ' ',
    color: undefined as string | undefined,
    bold: false,
    dim: false,
    occupied: false,
  }));

  let col = 0;
  for (const span of spans) {
    for (let i = 0; i < span.text.length && col < totalWidth; i++) {
      const ch = span.text[i]!;
      cells[col] = {
        ch,
        color: span.color,
        bold: !!span.bold,
        dim: !!span.dim,
        occupied: ch !== ' ',
      };
      col++;
    }
  }

  type Segment = {
    text: string;
    color?: string;
    bgColor?: string;
    bold: boolean;
    dim: boolean;
  };

  const segments: Segment[] = [];
  for (let x = 0; x < totalWidth; x++) {
    const cell = cells[x]!;
    const bgColor = panelColors[x];
    const segment: Segment = {
      text: cell.ch,
      color: bgColor ? foregroundForPanelCell(cell.color, cell.occupied) : cell.color,
      bgColor,
      bold: cell.bold,
      // Dim works poorly on bright backgrounds in some Windows terminals, so only dim text
      // that has no explicit color.
      dim: bgColor && cell.color ? false : cell.dim,
    };

    const last = segments[segments.length - 1];
    if (
      last &&
      last.color === segment.color &&
      last.bgColor === segment.bgColor &&
      last.bold === segment.bold &&
      last.dim === segment.dim
    ) {
      last.text += segment.text;
    } else {
      segments.push(segment);
    }
  }

  return (
    <Box flexDirection="row" width={totalWidth} height={1}>
      {segments.map((segment, i) => (
        <Box key={i} width={segment.text.length} height={1} backgroundColor={segment.bgColor as any}>
          <Text color={segment.color as any} bold={segment.bold} dimColor={segment.dim}>
            {segment.text}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function EffortSlider({
  initialIndex,
  onConfirm,
  onCancel,
}: {
  initialIndex: number;
  onConfirm: (level: SliderLevel) => void;
  onCancel: () => void;
}): React.ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const { columns } = useTerminalSize();

  const animTime = useAnimationTimer(GLOW_INTERVAL_MS);

  // Keep shared Clock alive while in ultracode mode to drive background animations
  const selected = SLIDER_LEVELS[selectedIndex]!;
  const isUltra = selected === 'ultracode';
  const [ultraEnterAnimTime, setUltraEnterAnimTime] = React.useState<number | null>(isUltra ? animTime : null);

  React.useEffect(() => {
    setUltraEnterAnimTime(isUltra ? animTime : null);
    // Only reset when entering/leaving ultracode. Including animTime would restart
    // the reveal on every animation frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUltra]);

  const clock = React.useContext(ClockContext);
  React.useEffect(() => {
    if (!clock || !isUltra) return;
    const unsubscribe = clock.subscribe(() => {
      // Intentionally empty: keeping clock active during ultracode mode
    }, true);
    return unsubscribe;
  }, [clock, isUltra]);

  useInput((_input, key) => {
    if (key.return) {
      onConfirm(SLIDER_LEVELS[selectedIndex]!);
      return;
    }
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.leftArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }
    if (key.rightArrow) {
      setSelectedIndex(i => Math.min(SLIDER_LEVELS.length - 1, i + 1));
      return;
    }
  });

  const innerWidth = Math.max(50, columns - 8);
  const layout = computeLayout(innerWidth);
  const { labelCols, sepCol, totalWidth } = layout;

  const markerCol =
    selectedIndex < STD_COUNT
      ? labelCols[selectedIndex]! + Math.floor(SLIDER_LEVELS[selectedIndex]!.length / 2)
      : labelCols[5]! + Math.floor('ultracode'.length / 2);

  // 1. Faster / Smarter Line
  const fasterSmarterLine: Span[] = [];
  const smarterText = 'Smarter';
  const smarterCol = totalWidth - smarterText.length;
  fasterSmarterLine.push({ text: 'Faster', dim: !isUltra, bold: isUltra, color: isUltra ? '#ffffff' : undefined });
  fasterSmarterLine.push({ text: ' '.repeat(Math.max(1, smarterCol - 6)) });
  fasterSmarterLine.push({
    text: smarterText,
    bold: isUltra,
    color: isUltra ? '#ffffff' : undefined,
    dim: !isUltra,
  });

  // 2. Track Line with inline ▲
  const trackChars: string[] = new Array(totalWidth).fill('─');
  if (sepCol < totalWidth) {
    trackChars[sepCol] = '┊';
  }
  if (markerCol >= 0 && markerCol < totalWidth) {
    trackChars[markerCol] = '▲';
  }

  const trackLine: Span[] = [];
  for (let i = 0; i < totalWidth; i++) {
    const ch = trackChars[i]!;
    const isMarker = i === markerCol;
    const isInUltraZone = i > sepCol;
    if (isMarker) {
      trackLine.push({ text: ch, bold: true, color: isUltra ? '#ffffff' : getSelectedColor(selected) });
    } else if (i === sepCol) {
      trackLine.push({ text: ch, bold: isUltra, color: isUltra ? '#ffffff' : undefined, dim: !isUltra });
    } else if (isInUltraZone) {
      trackLine.push({ text: ch, color: isUltra ? '#c084fc' : '#7c3aed', dim: !isUltra });
    } else {
      trackLine.push({ text: ch, dim: true });
    }
  }

  const mergedTrack: Span[] = [];
  for (const span of trackLine) {
    const last = mergedTrack[mergedTrack.length - 1];
    if (last && last.color === span.color && last.bold === span.bold && last.dim === span.dim) {
      last.text += span.text;
    } else {
      mergedTrack.push({ ...span });
    }
  }

  // 3. Labels Line
  const labelChars: Array<{ ch: string; color?: string; bold?: boolean; dim?: boolean }> = [];
  for (let i = 0; i < totalWidth; i++) {
    labelChars.push({ ch: ' ' });
  }
  for (let li = 0; li < SLIDER_LEVELS.length; li++) {
    const label = SLIDER_LEVELS[li]!;
    const col = labelCols[li]!;
    const isSel = li === selectedIndex;

    let fgColor: string | undefined;
    let isBold = isSel;
    let isDim = !isSel;

    if (isUltra) {
      if (isSel) {
        fgColor = '#ffffff';
        isBold = true;
        isDim = false;
      } else {
        fgColor = '#a78bfa';
        isBold = false;
        isDim = true;
      }
    } else {
      if (isSel) {
        fgColor = getSelectedColor(label);
        isBold = true;
        isDim = false;
      } else {
        fgColor = undefined;
        isBold = false;
        isDim = true;
      }
    }

    for (let ci = 0; ci < label.length && col + ci < totalWidth; ci++) {
      labelChars[col + ci] = {
        ch: label[ci]!,
        color: fgColor,
        bold: isBold,
        dim: isDim,
      };
    }
  }

  const labelSpans: Span[] = [];
  for (const lc of labelChars) {
    const last = labelSpans[labelSpans.length - 1];
    if (last && last.color === lc.color && last.bold === lc.bold && last.dim === lc.dim) {
      last.text += lc.ch;
    } else {
      labelSpans.push({ text: lc.ch, color: lc.color, bold: lc.bold, dim: lc.dim });
    }
  }

  // 4. Subtitle Line "xhigh + workflows"
  const ultraCol = labelCols[5]!;
  const subtitleSpans: Span[] = [
    { text: ' '.repeat(ultraCol) },
    {
      text: 'xhigh + workflows',
      color: isUltra ? '#ffffff' : undefined,
      bold: isUltra,
      dim: !isUltra,
    },
  ];

  // 5. Purple animated panel. It is only active after the cursor moves to ultracode.
  // The first frames are a small oval around ultracode; the oval then expands into
  // a bounded spotlight so the panel does not turn into a solid purple block.
  const revealMs = 6000;
  const elapsedMs = ultraEnterAnimTime === null ? 0 : Math.max(0, animTime - ultraEnterAnimTime);
  const revealProgress = isUltra ? Math.min(1, elapsedMs / revealMs) : 0;
  // Once the reveal has filled the panel, freeze the wave. Otherwise the
  // background keeps drifting forever and turns into noisy vertical stripes.
  const panelAnimTime = ultraEnterAnimTime === null ? animTime : ultraEnterAnimTime + Math.min(elapsedMs, revealMs);
  const ultraCenterX = labelCols[5]! + Math.floor('ultracode'.length / 2);
  const ultraCenterY = 4;
  const emptyPanelColors = React.useMemo(
    () => Array.from({ length: totalWidth }, () => undefined as string | undefined),
    [totalWidth],
  );
  const panelColorsForRow = (row: number) =>
    isUltra
      ? computeExpandingPanelColors(totalWidth, row, panelAnimTime, revealProgress, ultraCenterX, ultraCenterY)
      : emptyPanelColors;

  // Grid lines
  const titleSpans: Span[] = [{ text: 'Effort', bold: true }];
  const spacerSpans: Span[] = [{ text: '' }];
  const bottomSpacerSpans: Span[] = [{ text: '' }];
  const helpSpans: Span[] = [{ text: '←/→ to adjust · Enter to confirm · Esc to cancel', dim: true }];

  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1} paddingBottom={1}>
      {renderLineWithPanel(titleSpans, totalWidth, panelColorsForRow(0))}
      {renderLineWithPanel(spacerSpans, totalWidth, panelColorsForRow(1))}
      {renderLineWithPanel(fasterSmarterLine, totalWidth, panelColorsForRow(2))}
      {renderLineWithPanel(mergedTrack, totalWidth, panelColorsForRow(3))}
      {renderLineWithPanel(labelSpans, totalWidth, panelColorsForRow(4))}
      {renderLineWithPanel(subtitleSpans, totalWidth, panelColorsForRow(5))}
      {renderLineWithPanel(bottomSpacerSpans, totalWidth, panelColorsForRow(6))}
      {renderLineWithPanel(helpSpans, totalWidth, panelColorsForRow(7))}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrappers
// ─────────────────────────────────────────────────────────────────────────────

function ShowCurrentEffort({ onDone }: { onDone: (result: string) => void }): React.ReactNode {
  const effortValue = useAppState(s => s.effortValue);
  const model = useMainLoopModel();
  const { message } = showCurrentEffort(effortValue, model);

  React.useEffect(() => {
    onDone(message);
  }, [message, onDone]);

  return null;
}

function ApplyEffortAndClose({
  result,
  onDone,
}: {
  result: EffortCommandResult;
  onDone: (result: string) => void;
}): React.ReactNode {
  const setAppState = useSetAppState();
  const { effortUpdate, message } = result;
  React.useEffect(() => {
    if (effortUpdate) {
      setAppState(prev => ({
        ...prev,
        effortValue: effortUpdate.value,
      }));
    }
    onDone(message);
  }, [setAppState, effortUpdate, message, onDone]);
  return null;
}

function EffortSliderWrapper({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const effortValue = useAppState(s => s.effortValue);
  const setAppState = useSetAppState();
  const model = useMainLoopModel();
  const initialIndex = getSliderIndexForCurrentEffort(effortValue, model);

  const handleConfirm = useCallback(
    (level: SliderLevel) => {
      const isUltra = level === 'ultracode';
      const effortLevel = isUltra ? 'xhigh' : level;
      const result = setEffortValue(effortLevel as EffortValue, isUltra);

      if (result.effortUpdate) {
        setAppState(prev => ({
          ...prev,
          effortValue: result.effortUpdate!.value,
        }));
      }

      // Enable ultracode state in global __appState so PromptInput shows
      // the purple double border. Only when ultracode is selected.
      if (isUltra) {
        try {
          const g = globalThis as { __appState?: { set?: (k: string, v: unknown) => void } };
          g.__appState?.set?.('ultracodeState', { enabled: true, confirmedOnce: true, workflowsStarted: 0 });
        } catch {
          /* ignore */
        }
      }

      onDone(result.message);
    },
    [setAppState, onDone],
  );

  const handleCancel = useCallback(() => {
    onDone('Effort level unchanged.');
  }, [onDone]);

  return <EffortSlider initialIndex={initialIndex} onConfirm={handleConfirm} onCancel={handleCancel} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string): Promise<React.ReactNode> {
  args = args?.trim() || '';

  if (COMMON_HELP_ARGS.includes(args)) {
    onDone(
      'Usage: /effort [low|medium|high|xhigh|max|ultracode|auto]\n\nEffort levels:\n- low: Quick, straightforward implementation\n- medium: Balanced approach with standard testing\n- high: Comprehensive implementation with extensive testing\n- xhigh: Enhanced reasoning capability (Opus 4.7+)\n- max: Maximum capability with deepest reasoning (Opus 4.6+)\n- ultracode: xhigh + dynamic workflows for maximum thoroughness\n- auto: Use the default effort level for your model\n\nRun /effort without arguments for interactive mode.',
    );
    return;
  }

  // "current" / "status" show current effort without interactive slider
  if (args === 'current' || args === 'status') {
    return <ShowCurrentEffort onDone={onDone} />;
  }

  // No args → interactive slider
  if (!args) {
    return <EffortSliderWrapper onDone={onDone} />;
  }

  // Direct set: /effort high, /effort ultracode, etc.
  const result = executeEffort(args);
  return <ApplyEffortAndClose result={result} onDone={onDone} />;
}
