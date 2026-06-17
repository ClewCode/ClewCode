/**
 * Plugin dependency resolution — pure functions, no I/O.
 *
 * Semantics are `apt`-style: a dependency is a *presence guarantee*, not a
 * module graph. Plugin A depending on Plugin B means "B's namespaced
 * components (MCP servers, commands, agents) must be available when A runs."
 *
 * Two entry points:
 *  - `resolveDependencyClosure` — install-time DFS walk, cycle detection
 *  - `verifyAndDemote` — load-time fixed-point check, demotes plugins with
 *    unsatisfied deps (session-local, does NOT write settings)
 */
import { getSettingsForSource } from '../settings/settings.js';
import { parsePluginIdentifier } from './pluginIdentifier.js';

/**
 * Synthetic marketplace sentinel for `--plugin-dir` plugins (pluginLoader.ts
 * sets `source = "{name}@inline"`). Not a real marketplace — bare deps from
 * these plugins cannot meaningfully inherit it.
 */
const INLINE_MARKETPLACE = 'inline';
/**
 * Normalize a dependency reference to fully-qualified "name@marketplace" form.
 * Bare names (no @) inherit the marketplace of the plugin declaring them —
 * cross-marketplace deps are blocked anyway, so the @-suffix is boilerplate
 * in the common case.
 *
 * EXCEPTION: if the declaring plugin is @inline (loaded via --plugin-dir),
 * bare deps are returned unchanged. `inline` is a synthetic sentinel, not a
 * real marketplace — fabricating "dep@inline" would never match anything.
 * verifyAndDemote handles bare deps via name-only matching.
 */
export function qualifyDependency(dep, declaringPluginId) {
  if (parsePluginIdentifier(dep).marketplace) return dep;
  const mkt = parsePluginIdentifier(declaringPluginId).marketplace;
  if (!mkt || mkt === INLINE_MARKETPLACE) return dep;
  return `${dep}@${mkt}`;
}
/**
 * Walk the transitive dependency closure of `rootId` via DFS.
 *
 * The returned `closure` ALWAYS contains `rootId`, plus every transitive
 * dependency that is NOT in `alreadyEnabled`. Already-enabled deps are
 * skipped (not recursed into) — this avoids surprise settings writes when a
 * dep is already installed at a different scope. The root is never skipped,
 * even if already enabled, so re-installing a plugin always re-caches it.
 *
 * Cross-marketplace dependencies are BLOCKED by default: a plugin in
 * marketplace A cannot auto-install a plugin from marketplace B. This is
 * a security boundary — installing from a trusted marketplace shouldn't
 * silently pull from an untrusted one. Two escapes: (1) install the
 * cross-mkt dep yourself first (already-enabled deps are skipped, so the
 * closure won't touch it), or (2) the ROOT marketplace's
 * `allowCrossMarketplaceDependenciesOn` allowlist — only the root's list
 * applies for the whole walk (no transitive trust: if A allows B, B's
 * plugin depending on C is still blocked unless A also allows C).
 *
 * @param rootId Root plugin to resolve from (format: "name@marketplace")
 * @param lookup Async lookup returning `{dependencies}` or `null` if not found
 * @param alreadyEnabled Plugin IDs to skip (deps only, root is never skipped)
 * @param allowedCrossMarketplaces Marketplace names the root trusts for
 *   auto-install (from the root marketplace's manifest)
 * @returns Closure to install, or a cycle/not-found/cross-marketplace error
 */
export async function resolveDependencyClosure(rootId, lookup, alreadyEnabled, allowedCrossMarketplaces = new Set()) {
  const rootMarketplace = parsePluginIdentifier(rootId).marketplace;
  const closure = [];
  const visited = new Set();
  const stack = [];
  async function walk(id, requiredBy) {
    // Skip already-enabled DEPENDENCIES (avoids surprise settings writes),
    // but NEVER skip the root: installing an already-enabled plugin must
    // still cache/register it. Without this guard, re-installing a plugin
    // that's in settings but missing from disk (e.g., cache cleared,
    // installed_plugins.json stale) would return an empty closure and
    // `cacheAndRegisterPlugin` would never fire — user sees
    // "✔ Successfully installed" but nothing materializes.
    if (id !== rootId && alreadyEnabled.has(id)) return null;
    // Security: block auto-install across marketplace boundaries. Runs AFTER
    // the alreadyEnabled check — if the user manually installed a cross-mkt
    // dep, it's in alreadyEnabled and we never reach this.
    const idMarketplace = parsePluginIdentifier(id).marketplace;
    if (idMarketplace !== rootMarketplace && !(idMarketplace && allowedCrossMarketplaces.has(idMarketplace))) {
      return {
        ok: false,
        reason: 'cross-marketplace',
        dependency: id,
        requiredBy,
      };
    }
    if (stack.includes(id)) {
      return { ok: false, reason: 'cycle', chain: [...stack, id] };
    }
    if (visited.has(id)) return null;
    visited.add(id);
    const entry = await lookup(id);
    if (!entry) {
      return { ok: false, reason: 'not-found', missing: id, requiredBy };
    }
    stack.push(id);
    for (const rawDep of entry.dependencies ?? []) {
      const dep = qualifyDependency(rawDep, id);
      const err = await walk(dep, id);
      if (err) return err;
    }
    stack.pop();
    closure.push(id);
    return null;
  }
  const err = await walk(rootId, rootId);
  if (err) return err;
  return { ok: true, closure };
}
/**
 * Load-time safety net: for each enabled plugin, verify all manifest
 * dependencies are also in the enabled set. Demote any that fail.
 *
 * Fixed-point loop: demoting plugin A may break plugin B that depends on A,
 * so we iterate until nothing changes.
 *
 * The `reason` field distinguishes:
 *  - `'not-enabled'` — dep exists in the loaded set but is disabled
 *  - `'not-found'` — dep is entirely absent (not in any marketplace)
 *
 * Does NOT mutate input. Returns the set of plugin IDs (sources) to demote.
 *
 * @param plugins All loaded plugins (enabled + disabled)
 * @returns Set of pluginIds to demote, plus errors for `/doctor`
 */
export function verifyAndDemote(plugins) {
  const known = new Set(plugins.map(p => p.source));
  const enabled = new Set(plugins.filter(p => p.enabled).map(p => p.source));
  // Name-only indexes for bare deps from --plugin-dir (@inline) plugins:
  // the real marketplace is unknown, so match "B" against any enabled "B@*".
  // enabledByName is a multiset: if B@epic AND B@other are both enabled,
  // demoting one mustn't make "B" disappear from the index.
  const knownByName = new Set(plugins.map(p => parsePluginIdentifier(p.source).name));
  const enabledByName = new Map();
  for (const id of enabled) {
    const n = parsePluginIdentifier(id).name;
    enabledByName.set(n, (enabledByName.get(n) ?? 0) + 1);
  }
  const errors = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of plugins) {
      if (!enabled.has(p.source)) continue;
      for (const rawDep of p.manifest.dependencies ?? []) {
        const dep = qualifyDependency(rawDep, p.source);
        // Bare dep ← @inline plugin: match by name only (see enabledByName)
        const isBare = !parsePluginIdentifier(dep).marketplace;
        const satisfied = isBare ? (enabledByName.get(dep) ?? 0) > 0 : enabled.has(dep);
        if (!satisfied) {
          enabled.delete(p.source);
          // Use the parsed source name (from p.source), not p.name (manifest
          // name), since enabledByName is keyed by source identifier name and
          // the two can differ (e.g. GitHub-style "repo-name" vs display "Repo Name").
          const parsedSourceName = parsePluginIdentifier(p.source).name;
          const count = enabledByName.get(parsedSourceName) ?? 0;
          if (count <= 1) enabledByName.delete(p.name);
          else enabledByName.set(p.name, count - 1);
          errors.push({
            type: 'dependency-unsatisfied',
            source: p.source,
            plugin: p.name,
            dependency: dep,
            reason: (isBare ? knownByName.has(dep) : known.has(dep)) ? 'not-enabled' : 'not-found',
          });
          changed = true;
          break;
        }
      }
    }
  }
  const demoted = new Set(plugins.filter(p => p.enabled && !enabled.has(p.source)).map(p => p.source));
  return { demoted, errors };
}
/**
 * Find all enabled plugins that declare `pluginId` as a dependency.
 * Used to warn on uninstall/disable ("required by: X, Y").
 *
 * @param pluginId The plugin being removed/disabled
 * @param plugins All loaded plugins (only enabled ones are checked)
 * @returns Names of plugins that will break if `pluginId` goes away
 */
export function findReverseDependents(pluginId, plugins) {
  const { name: targetName } = parsePluginIdentifier(pluginId);
  return plugins
    .filter(
      p =>
        p.enabled &&
        p.source !== pluginId &&
        (p.manifest.dependencies ?? []).some(d => {
          const qualified = qualifyDependency(d, p.source);
          // Bare dep (from @inline plugin): match by name only
          return parsePluginIdentifier(qualified).marketplace ? qualified === pluginId : qualified === targetName;
        }),
    )
    .map(p => p.name);
}
/**
 * Build the set of plugin IDs currently enabled at a given settings scope.
 * Used by install-time resolution to skip already-enabled deps and avoid
 * surprise settings writes.
 *
 * Matches `true` (plain enable) AND array values (version constraints per
 * settings/types.ts:455-463 — a plugin at `"foo@bar": ["^1.0.0"]` IS enabled).
 * Without the array check, a version-pinned dep would be re-added to the
 * closure and the settings write would clobber the constraint with `true`.
 */
export function getEnabledPluginIdsForScope(settingSource) {
  return new Set(
    Object.entries(getSettingsForSource(settingSource)?.enabledPlugins ?? {})
      .filter(([, v]) => v === true || Array.isArray(v))
      .map(([k]) => k),
  );
}
/**
 * Format the "(+ N dependencies)" suffix for install success messages.
 * Returns empty string when `installedDeps` is empty.
 */
export function formatDependencyCountSuffix(installedDeps) {
  if (installedDeps.length === 0) return '';
  const n = installedDeps.length;
  return ` (+ ${n} ${n === 1 ? 'dependency' : 'dependencies'})`;
}
/**
 * Format the "warning: required by X, Y" suffix for uninstall/disable
 * results. Em-dash style for CLI result messages (not the middot style
 * used in the notification UI). Returns empty string when no dependents.
 */
export function formatReverseDependentsSuffix(rdeps) {
  if (!rdeps || rdeps.length === 0) return '';
  return ` — warning: required by ${rdeps.join(', ')}`;
}
/**
 * Format a disable-refusal message with a copy-pasteable chain hint.
 * Example output:
 *   Cannot disable "plugin-a" — required by: plugin-b, plugin-c
 *   Disable dependents first and retry, or use:
 *     claude plugin disable plugin-b && claude plugin disable plugin-c && claude plugin disable plugin-a
 *
 * Returns empty string when no reverse dependents.
 */
export function formatDisableChainHint(rdeps) {
  if (!rdeps || rdeps.length === 0) return '';
  const chain = [...rdeps, '<target>'].join(' && claude plugin disable ');
  return `Cannot disable — required by: ${rdeps.join(', ')}. Disable dependents first and retry, or use:\n  claude plugin disable ${chain}`;
}
