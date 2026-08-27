/**
 * High-level Taste retriever for the Context Compiler and QueryEngine.
 */

import { getTasteStore } from '../store/taste-store.js';
import type { TaskContext, TasteRule, TasteStore } from '../types.js';
import { formatTasteContext } from './formatter.js';
import { rankTasteRules } from './scorer.js';

export interface RetrieveTasteOptions {
  store?: TasteStore;
  maxRules?: number;
  minConfidence?: number;
  maxChars?: number;
}

export async function retrieveTasteRules(context?: TaskContext, options?: RetrieveTasteOptions): Promise<TasteRule[]> {
  const store = options?.store ?? getTasteStore();
  const allRules = await store.list({
    language: context?.language,
    category: context?.category,
    status: ['active', 'weak'],
  });

  return rankTasteRules(allRules, context, {
    maxRules: options?.maxRules ?? 8,
    minConfidence: options?.minConfidence ?? 0.6,
  });
}

export async function loadTastePrompt(context?: TaskContext, options?: RetrieveTasteOptions): Promise<string | null> {
  try {
    const rules = await retrieveTasteRules(context, options);
    return formatTasteContext(rules, {
      maxRules: options?.maxRules ?? 8,
      maxChars: options?.maxChars ?? 2000,
    });
  } catch {
    return null;
  }
}
