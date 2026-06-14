/**
 * Browser Tool — Type Definitions (Extended Control)
 */

export type BrowserAction =
  | 'navigate'
  | 'click'
  | 'click_at'
  | 'type'
  | 'type_at'
  | 'fill'
  | 'clear'
  | 'press'
  | 'scroll'
  | 'screenshot'
  | 'extract'
  | 'status'
  | 'close'
  // ── Precise targeting ──
  | 'click_text'
  | 'click_role'
  | 'fill_label'
  // ── Form controls ──
  | 'select'
  | 'check'
  | 'uncheck'
  | 'upload'
  // ── Navigation ──
  | 'go_back'
  | 'go_forward'
  | 'reload'
  // ── Page interaction ──
  | 'hover'
  | 'focus'
  | 'wait_for'
  | 'wait_for_url'
  | 'wait'
  // ── iFrame & popup ──
  | 'frame_click'
  | 'frame_fill'
  | 'handle_dialog'
  // ── Content extraction ──
  | 'get_text'
  | 'get_attribute'
  | 'get_value'
  | 'get_links'
  | 'get_inputs'
  | 'evaluate'
  | 'search'
  | 'request_help'
  | 'vision_map'
  | 'extract_data'
  | 'switch_tab'
  | 'open_new_tab'
  | 'close_tab'
  | 'list_tabs'
  | 'drag_and_drop';

export interface BrowserActionInput {
  action: BrowserAction;
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  direction?: 'up' | 'down';
  amount?: number;
  x?: number;
  y?: number;
  index?: number; // Tab index for switch_tab / close_tab
  // Extended fields
  role?: string; // ARIA role (button, link, textbox, checkbox, etc.)
  name?: string; // Accessible name for getByRole
  label?: string; // Label text for getByLabel
  value?: string; // For select/attribute
  attribute?: string; // Attribute name to get
  filePath?: string; // For file upload
  checked?: boolean; // For check/uncheck
  frameSelector?: string; // For iframe targeting
  dialogAction?: 'accept' | 'dismiss'; // For dialog handling
  dialogText?: string; // Text to input in prompt dialog
  expression?: string; // JS expression for evaluate
  engine?: 'google' | 'bing' | 'duckduckgo' | 'twitter' | 'reddit' | 'github'; // Search engine
  query?: string; // Search query
  timeout?: number; // Custom timeout in ms
  headless?: boolean; // Override browser headless mode for this session
}

export interface BrowserResult {
  ok: boolean;
  url: string;
  title: string;
  content?: string;
  screenshot?: string;
  error?: string;
  tabs?: Array<{
    index: number;
    title: string;
    url: string;
    active: boolean;
  }>;
}
