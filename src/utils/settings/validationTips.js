const DOCUMENTATION_BASE = 'https://code.claude.com/docs/en';
const TIP_MATCHERS = [
  {
    matches: ctx => ctx.path === 'permissions.defaultMode' && ctx.code === 'invalid_value',
    tip: {
      suggestion: 'Valid modes: "default", "plan", "acceptEdits", "bypassPermissions", or "auto"',
      docLink: `${DOCUMENTATION_BASE}/iam#permission-modes`,
    },
  },
  {
    matches: ctx => ctx.path === 'apiKeyHelper' && ctx.code === 'invalid_type',
    tip: {
      suggestion:
        'Provide a shell command that outputs your API key to stdout. The script should output only the API key. Example: "/bin/generate_temp_api_key.sh"',
    },
  },
  {
    matches: ctx => ctx.path === 'cleanupPeriodDays' && ctx.code === 'too_small' && ctx.expected === '0',
    tip: {
      suggestion:
        'Must be 0 or greater. Set a positive number for days to retain transcripts (default is 30). Setting 0 disables session persistence entirely: no transcripts are written and existing transcripts are deleted at startup.',
    },
  },
  {
    matches: ctx => ctx.path.startsWith('env.') && ctx.code === 'invalid_type',
    tip: {
      suggestion:
        'Environment variables must be strings. Wrap numbers and booleans in quotes. Example: "DEBUG": "true", "PORT": "3000"',
      docLink: `${DOCUMENTATION_BASE}/settings#environment-variables`,
    },
  },
  {
    matches: ctx =>
      (ctx.path === 'permissions.allow' || ctx.path === 'permissions.deny') &&
      ctx.code === 'invalid_type' &&
      ctx.expected === 'array',
    tip: {
      suggestion:
        'Permission rules must be in an array. Format: ["Tool(specifier)"]. Examples: ["Bash(npm run build)", "Edit(docs/**)", "Read(~/.zshrc)"]. Use * for wildcards.',
    },
  },
  {
    matches: ctx => ctx.path.includes('hooks') && ctx.code === 'invalid_type',
    tip: {
      suggestion:
        // gh-31187 / CC-282: prior example showed {"matcher": {"tools": ["BashTool"]}}
        // — an object format that never existed in the schema (matcher is z.string(),
        // always has been). Users copied the tip's example and got the same validation
        // error again. See matchesPattern() in hooks.ts: matcher is exact-match,
        // pipe-separated ("Edit|Write"), or regex. Empty/"*" matches all.
        'Hooks use a matcher + hooks array. The matcher is a string: a tool name ("Bash"), pipe-separated list ("Edit|Write"), or empty to match all. Example: {"PostToolUse": [{"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "echo Done"}]}]}',
    },
  },
  {
    matches: ctx =>
      ctx.path.includes('hooks') &&
      ctx.path.endsWith('command') &&
      ctx.code === 'invalid_type' &&
      ctx.expected === 'string',
    tip: {
      suggestion:
        'The "command" field must be a string. For the exec form (no shell), use "command" with an executable path and "args" as an array. Example: {"type": "command", "command": "/usr/bin/node", "args": ["script.js"]}',
    },
  },
  {
    matches: ctx => ctx.code === 'invalid_type' && ctx.expected === 'boolean',
    tip: {
      suggestion: 'Use true or false without quotes. Example: "includeCoAuthoredBy": true',
    },
  },
  {
    matches: ctx => ctx.code === 'unrecognized_keys',
    tip: {
      suggestion: 'Check for typos or refer to the documentation for valid fields',
      docLink: `${DOCUMENTATION_BASE}/settings`,
    },
  },
  {
    matches: ctx => ctx.code === 'invalid_value' && ctx.enumValues !== undefined,
    tip: {
      suggestion: undefined,
    },
  },
  {
    matches: ctx =>
      ctx.code === 'invalid_type' && ctx.expected === 'object' && ctx.received === null && ctx.path === '',
    tip: {
      suggestion:
        'Check for missing commas, unmatched brackets, or trailing commas. Use a JSON validator to identify the exact syntax error.',
    },
  },
  {
    matches: ctx => ctx.path === 'permissions.additionalDirectories' && ctx.code === 'invalid_type',
    tip: {
      suggestion:
        'Must be an array of directory paths. Example: ["~/projects", "/tmp/workspace"]. You can also use --add-dir flag or /add-dir command',
      docLink: `${DOCUMENTATION_BASE}/iam#working-directories`,
    },
  },
];
const PATH_DOC_LINKS = {
  permissions: `${DOCUMENTATION_BASE}/iam#configuring-permissions`,
  env: `${DOCUMENTATION_BASE}/settings#environment-variables`,
  hooks: `${DOCUMENTATION_BASE}/hooks`,
};
export function getValidationTip(context) {
  const matcher = TIP_MATCHERS.find(m => m.matches(context));
  if (!matcher) return null;
  const tip = { ...matcher.tip };
  if (context.code === 'invalid_value' && context.enumValues && !tip.suggestion) {
    tip.suggestion = `Valid values: ${context.enumValues.map(v => `"${v}"`).join(', ')}`;
  }
  // Add documentation link based on path prefix
  if (!tip.docLink && context.path) {
    const pathPrefix = context.path.split('.')[0];
    if (pathPrefix) {
      tip.docLink = PATH_DOC_LINKS[pathPrefix];
    }
  }
  return tip;
}
