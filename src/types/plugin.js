/**
 * Helper function to get a display message from any PluginError
 * Useful for logging and simple error displays
 */
export function getPluginErrorMessage(error) {
  switch (error.type) {
    case 'generic-error':
      return error.error;
    case 'path-not-found':
      return `Path not found: ${error.path} (${error.component})`;
    case 'git-auth-failed':
      return `Git authentication failed (${error.authType}): ${error.gitUrl}`;
    case 'git-timeout':
      return `Git ${error.operation} timeout: ${error.gitUrl}`;
    case 'network-error':
      return `Network error: ${error.url}${error.details ? ` - ${error.details}` : ''}`;
    case 'manifest-parse-error':
      return `Manifest parse error: ${error.parseError}`;
    case 'manifest-validation-error':
      return `Manifest validation failed: ${error.validationErrors.join(', ')}`;
    case 'plugin-not-found':
      return `Plugin ${error.pluginId} not found in marketplace ${error.marketplace}`;
    case 'marketplace-not-found':
      return `Marketplace ${error.marketplace} not found`;
    case 'marketplace-load-failed':
      return `Marketplace ${error.marketplace} failed to load: ${error.reason}`;
    case 'mcp-config-invalid':
      return `MCP server ${error.serverName} invalid: ${error.validationError}`;
    case 'mcp-server-suppressed-duplicate': {
      const dup = error.duplicateOf.startsWith('plugin:')
        ? `server provided by plugin "${error.duplicateOf.split(':')[1] ?? '?'}"`
        : `already-configured "${error.duplicateOf}"`;
      return `MCP server "${error.serverName}" skipped — same command/URL as ${dup}`;
    }
    case 'hook-load-failed':
      return `Hook load failed: ${error.reason}`;
    case 'component-load-failed':
      return `${error.component} load failed from ${error.path}: ${error.reason}`;
    case 'mcpb-download-failed':
      return `Failed to download MCPB from ${error.url}: ${error.reason}`;
    case 'mcpb-extract-failed':
      return `Failed to extract MCPB ${error.mcpbPath}: ${error.reason}`;
    case 'mcpb-invalid-manifest':
      return `MCPB manifest invalid at ${error.mcpbPath}: ${error.validationError}`;
    case 'lsp-config-invalid':
      return `Plugin "${error.plugin}" has invalid LSP server config for "${error.serverName}": ${error.validationError}`;
    case 'lsp-server-start-failed':
      return `Plugin "${error.plugin}" failed to start LSP server "${error.serverName}": ${error.reason}`;
    case 'lsp-server-crashed':
      if (error.signal) {
        return `Plugin "${error.plugin}" LSP server "${error.serverName}" crashed with signal ${error.signal}`;
      }
      return `Plugin "${error.plugin}" LSP server "${error.serverName}" crashed with exit code ${error.exitCode ?? 'unknown'}`;
    case 'lsp-request-timeout':
      return `Plugin "${error.plugin}" LSP server "${error.serverName}" timed out on ${error.method} request after ${error.timeoutMs}ms`;
    case 'lsp-request-failed':
      return `Plugin "${error.plugin}" LSP server "${error.serverName}" ${error.method} request failed: ${error.error}`;
    case 'marketplace-blocked-by-policy':
      if (error.blockedByBlocklist) {
        return `Marketplace '${error.marketplace}' is blocked by enterprise policy`;
      }
      return `Marketplace '${error.marketplace}' is not in the allowed marketplace list`;
    case 'dependency-unsatisfied': {
      const hint =
        error.reason === 'not-enabled'
          ? 'disabled — enable it or remove the dependency'
          : 'not found in any configured marketplace';
      return `Dependency "${error.dependency}" is ${hint}`;
    }
    case 'plugin-cache-miss':
      return `Plugin "${error.plugin}" not cached at ${error.installPath} — run /plugins to refresh, or \`claude plugin install ${error.plugin}\` to install it`;
  }
}
