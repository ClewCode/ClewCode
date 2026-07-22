/**
 * Keybinding type definitions for Clew Code.
 *
 * Shared types used across the keybinding system:
 * - parser.ts (parse, stringify)
 * - match.ts (match keystroke to binding)
 * - resolver.ts (resolve key input to action)
 * - validate.ts (validate user config)
 * - loadUserBindings.ts (load + merge bindings)
 * - template.ts (generate user template)
 * - useKeybinding.ts (React hook)
 * - KeybindingContext.tsx (React context provider)
 * - shortcutFormat.ts / useShortcutDisplay.ts (display helpers)
 */

/**
 * A single parsed keystroke with modifier flags.
 */
export interface ParsedKeystroke {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  super: boolean;
}

/**
 * A chord is one or more keystrokes that trigger an action.
 * Single keystroke: [ks]               e.g. [ctrl+c]
 * Multi-keystroke:  [ks1, ks2, ...]    e.g. [ctrl+x, ctrl+k]
 */
export type Chord = ParsedKeystroke[];

/**
 * A flat parsed binding — the result of parsing a KeybindingBlock.
 */
export interface ParsedBinding {
  chord: Chord;
  action: string | null;
  context: KeybindingContextName;
}

/**
 * A keybinding block as written in config JSON.
 */
export interface KeybindingBlock {
  context: string;
  bindings: Record<string, string | null>;
}

/**
 * Valid keybinding context names.
 * Must be kept in sync with KEYBINDING_CONTEXTS in schema.ts.
 */
export type KeybindingContextName =
  | 'Global'
  | 'Chat'
  | 'Autocomplete'
  | 'Confirmation'
  | 'Help'
  | 'Transcript'
  | 'HistorySearch'
  | 'Task'
  | 'ThemePicker'
  | 'Settings'
  | 'Tabs'
  | 'Attachments'
  | 'Footer'
  | 'MessageSelector'
  | 'DiffDialog'
  | 'ModelPicker'
  | 'Select'
  | 'Plugin';
