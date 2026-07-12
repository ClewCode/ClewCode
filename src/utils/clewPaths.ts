/**
 * Central constants for the .claude → .clew migration.
 *
 * READ paths check .clew first, then .claude as legacy fallback.
 * WRITE/CREATE paths use .clew exclusively.
 */

// ── Directory names ────────────────────────────────────────
export const DOT_CLEW = '.clew';
export const DOT_CLAUDE = '.claude'; // legacy — keep for fallback reads

// ── File names (project root) ──────────────────────────────
export const CLEW_MD = 'CLEW.md';
export const CLEW_LOCAL_MD = 'CLEW.local.md';
export const CLAUDE_MD = 'CLAUDE.md'; // legacy fallback
export const CLAUDE_LOCAL_MD = 'CLAUDE.local.md'; // legacy fallback
export const AGENTS_MD = 'AGENTS.md';
export const RULES_DIR = 'rules';

// ── Config file names ──────────────────────────────────────
export const CLEW_CONFIG_JSON = '.clew.json';
export const CLAUDE_CONFIG_JSON = '.claude.json'; // legacy fallback

// ── Subdirectory names (inside .clew/ or .claude/) ─────────
export const AGENTS_DIR = 'agents';
export const RUNS_DIR = 'runs';
export const WORKFLOWS_DIR = 'workflows';
export const WORKTREES_DIR = 'worktrees';
export const COMMANDS_DIR = 'commands';
export const SKILLS_DIR = 'skills';
export const PLUGINS_DIR = 'plugins';
export const OUTPUT_STYLES_DIR = 'output-styles';
export const TEMPLATES_DIR = 'templates';
export const RESEARCH_DIR = 'research';
export const MEMORY_DIR = 'memory';
export const CACHE_DIR = 'cache';
export const SESSIONS_DIR = 'sessions';
export const BACKUPS_DIR = 'backups';
export const DEBUG_DIR = 'debug';
export const RULES_LOCAL_DIR = 'rules-local';
export const AGENT_MEMORY_DIR = 'agent-memory';
export const AGENT_MEMORY_LOCAL_DIR = 'agent-memory-local';
export const AGENT_MEMORY_SNAPSHOTS_DIR = 'agent-memory-snapshots';
export const WIKI_DIR = 'wiki';
export const INDEX_DIR = 'index';
export const TRACES_DIR = 'traces';
export const IDE_DIR = 'ide';
export const JOBS_DIR = 'jobs';
export const PROJECTS_DIR = 'projects';
export const TEAMS_DIR = 'teams';
export const TASKS_DIR = 'tasks';
export const INSTANCES_DIR = 'instances';
export const UPLOADS_DIR = 'uploads';
export const PEERS_DIR = 'peers';
export const SCHEDULED_TASKS_JSON = 'scheduled_tasks.json';
export const SCHEDULED_TASKS_LOCK = 'scheduled_tasks.lock';
export const SETTINGS_JSON = 'settings.json';
export const SETTINGS_LOCAL_JSON = 'settings.local.json';
export const LAUNCH_JSON = 'launch.json';
export const PROVIDER_JSON = 'provider.json';
export const KEYBINDINGS_JSON = 'keybindings.json';

// ── Permission patterns ────────────────────────────────────

/** Project-level .clew/ permission pattern */
export const CLEW_FOLDER_PERMISSION_PATTERN = `/${DOT_CLEW}/**`;
/** Global ~/.clew/ permission pattern */
export const GLOBAL_CLEW_FOLDER_PERMISSION_PATTERN = `~/${DOT_CLEW}/**`;

/** Legacy project-level .claude/ permission pattern */
export const CLAUDE_FOLDER_PERMISSION_PATTERN = `/${DOT_CLAUDE}/**`;
/** Legacy global ~/.clew/ permission pattern */
export const GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN = `~/${DOT_CLAUDE}/**`;

// ── Helpers ────────────────────────────────────────────────

/** Build a path under .clew/ (or .claude/ for legacy) */
export function clewPath(...segments: string[]): string {
  return [DOT_CLEW, ...segments].join('/');
}

export function claudePath(...segments: string[]): string {
  return [DOT_CLAUDE, ...segments].join('/');
}
