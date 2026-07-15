type StatusLineWindow = {
  used_percentage: number;
  resets_at: string | number;
};

export type StatusLineRateLimits = {
  five_hour?: StatusLineWindow;
  seven_day?: StatusLineWindow;
};

export type StatusLineCommandInput = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode?: string;
  agent_id?: string;
  agent_type?: string;
  session_name?: string;
  model: {
    id: string;
    display_name: string;
  };
  workspace: {
    current_dir: string;
    project_dir: string;
    added_dirs: string[];
    git_worktree: boolean;
  };
  version: string;
  output_style: {
    name: string;
  };
  cost: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_api_duration_ms: number;
    total_lines_added: number;
    total_lines_removed: number;
  };
  context_window: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    current_usage: unknown;
    used_percentage: number;
    remaining_percentage: number;
  };
  exceeds_200k_tokens: boolean;
  /** Anthropic subscription limits, from response headers. */
  rate_limits?: StatusLineRateLimits;
  /**
   * Codex (ChatGPT subscription) limits, captured off live `/responses` traffic.
   * Absent until the chatgpt provider has been used this session.
   */
  codex_rate_limits?: StatusLineRateLimits;
  vim?: {
    mode: string;
  };
  agent?: {
    name: string;
  };
  worktree?: {
    name: string;
    path: string;
    branch: string;
    original_cwd: string;
    original_branch: string;
  };
};
