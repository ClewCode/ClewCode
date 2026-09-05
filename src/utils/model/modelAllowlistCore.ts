import { isModelAlias, isModelFamilyAlias } from './aliases.js';
import { resolveOverriddenModel } from './modelStrings.js';

type AliasResolver = (model: string) => string;

function modelBelongsToFamily(model: string, family: string, resolveAlias: AliasResolver): boolean {
  if (model.includes(family)) return true;
  if (isModelAlias(model)) return resolveAlias(model).toLowerCase().includes(family);
  return false;
}

function prefixMatchesModel(modelName: string, prefix: string): boolean {
  if (!modelName.startsWith(prefix)) return false;
  return modelName.length === prefix.length || modelName[prefix.length] === '-';
}

function modelMatchesVersionPrefix(model: string, entry: string, resolveAlias: AliasResolver): boolean {
  const resolvedModel = isModelAlias(model) ? resolveAlias(model).toLowerCase() : model;
  if (prefixMatchesModel(resolvedModel, entry)) return true;
  return !entry.startsWith('claude-') && prefixMatchesModel(resolvedModel, `claude-${entry}`);
}

function familyHasSpecificEntries(family: string, allowlist: string[]): boolean {
  for (const entry of allowlist) {
    if (isModelFamilyAlias(entry)) continue;
    const idx = entry.indexOf(family);
    if (idx === -1) continue;
    const afterFamily = idx + family.length;
    if (afterFamily === entry.length || entry[afterFamily] === '-') return true;
  }
  return false;
}

/**
 * Pure allowlist matcher. Settings lookup and alias resolution are injected so
 * the model resolver can enforce the same policy without importing the
 * settings-backed modelAllowlist wrapper (which would create a runtime cycle).
 */
export function isModelAllowedByList(
  model: string,
  availableModels: readonly string[] | undefined,
  resolveAlias: AliasResolver,
): boolean {
  if (!availableModels) return true;
  if (availableModels.length === 0) return false;

  const resolvedModel = resolveOverriddenModel(model);
  const normalizedModel = resolvedModel.trim().toLowerCase();
  const normalizedAllowlist = availableModels.map(item => item.trim().toLowerCase());

  if (normalizedAllowlist.includes(normalizedModel)) {
    if (!isModelFamilyAlias(normalizedModel) || !familyHasSpecificEntries(normalizedModel, normalizedAllowlist)) {
      return true;
    }
  }

  for (const entry of normalizedAllowlist) {
    if (
      isModelFamilyAlias(entry) &&
      !familyHasSpecificEntries(entry, normalizedAllowlist) &&
      modelBelongsToFamily(normalizedModel, entry, resolveAlias)
    ) {
      return true;
    }
  }

  if (isModelAlias(normalizedModel)) {
    const resolved = resolveAlias(normalizedModel).toLowerCase();
    if (normalizedAllowlist.includes(resolved)) return true;
  }

  for (const entry of normalizedAllowlist) {
    if (!isModelFamilyAlias(entry) && isModelAlias(entry)) {
      if (resolveAlias(entry).toLowerCase() === normalizedModel) return true;
    }
  }

  for (const entry of normalizedAllowlist) {
    if (!isModelFamilyAlias(entry) && !isModelAlias(entry)) {
      if (modelMatchesVersionPrefix(normalizedModel, entry, resolveAlias)) return true;
    }
  }

  return false;
}
