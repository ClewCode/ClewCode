// Clew taste: Main runtime that orchestrates all subsystems

import { randomUUID } from 'crypto';
import { TastePromptInjector } from '../prompt/TastePromptInjector.js';
import { TasteSignalCollector } from '../signals/TasteSignalCollector.js';
import { TasteEventLog } from '../storage/TasteEventLog.js';
import { TasteProfileStore } from '../storage/TasteProfileStore.js';
import { TasteVectorStore } from '../storage/TasteVectorStore.js';
import { AutoLearnEngine } from '../auto-learn/AutoLearnEngine.js';
import { type BanditContext, TasteBandit } from './TasteBandit.js';
import { TasteDecay } from './TasteDecay.js';
import { TasteMemory } from './TasteMemory.js';
import { TasteNeuralScorer } from './TasteNeuralScorer.js';
import { type PolicyDecision, TastePolicy } from './TastePolicy.js';
import { TasteSymbolicEngine } from './TasteSymbolicEngine.js';
import {
  DEFAULT_BANDIT_STATE,
  DEFAULT_TASTE_CONFIG,
  type TasteBanditArm,
  type TasteConfig,
  type TasteEvent,
  type TasteProfile,
  type TasteRule,
  type TasteRuleKind,
  type TasteRuleSource,
} from './TasteTypes.js';

export class TasteRuntime {
  private profile: TasteProfile;
  private profilePath: string;
  private cwd: string;
  private config: TasteConfig;
  private symbolic: TasteSymbolicEngine;
  private neural: TasteNeuralScorer | null;
  private bandit: TasteBandit | null;
  private memory: TasteMemory;
  private decay: TasteDecay;
  private policy: TastePolicy;
  private collector: TasteSignalCollector;
  private eventLog: TasteEventLog;
  private vectorStore: TasteVectorStore;
  private injector: TastePromptInjector;
  private store: TasteProfileStore;
  private autoLearn: AutoLearnEngine;

  constructor(config?: Partial<TasteConfig>) {
    this.config = { ...DEFAULT_TASTE_CONFIG, ...config };
    this.cwd = process.cwd();
    this.profilePath = '';
    this.sessionId = '';
    this.profile = {
      version: 1,
      projectId: '',
      rules: [],
      bandit: { ...DEFAULT_BANDIT_STATE, updatedAt: new Date().toISOString() },
      stats: {
        totalEvents: 0,
        totalAccepts: 0,
        totalRejects: 0,
        totalEdits: 0,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
    this.memory = new TasteMemory();
    this.vectorStore = new TasteVectorStore();
    this.eventLog = new TasteEventLog();
    this.symbolic = new TasteSymbolicEngine(this.config.minConfidence, 0.85);
    this.neural = new TasteNeuralScorer(this.vectorStore, this.config.neuralScoringEnabled);
    this.bandit = new TasteBandit(undefined, 0.2, this.config.banditEnabled);
    this.decay = new TasteDecay(30, this.config.decayEnabled);
    this.policy = new TastePolicy(this.symbolic, this.neural, this.bandit, this.config);
    this.collector = new TasteSignalCollector(this.eventLog, '');
    this.injector = new TastePromptInjector(this.config.maxInjectedRules, this.config.minConfidence);
    this.store = new TasteProfileStore();
    this.autoLearn = new AutoLearnEngine({ enabled: config?.autoLearn ?? true });
  }

  async initialize(projectId?: string): Promise<void> {
    const id = projectId ?? this.cwd.split(/[/\\]/).pop() ?? 'default';
    const { profile, path } = await this.store.loadOrCreateProfile(id, this.cwd);
    this.profile = profile;
    this.profilePath = path;
    this.sessionId = `t1_${randomUUID().slice(0, 12)}`;

    // Re-initialize with loaded profile
    this.bandit?.setState(profile.bandit);
    this.eventLog.setPath(this.getEventsPath());

    // Apply config
    this.symbolic.setThresholds(this.config.minConfidence, 0.85);
    this.bandit?.setEpsilon(profile.bandit.epsilon);
    this.neural?.setEnabled(this.config.neuralScoringEnabled);
    this.decay.setEnabled(this.config.decayEnabled);
    this.bandit?.setEnabled(this.config.banditEnabled);

    // Apply decay to stale rules
    if (this.config.decayEnabled) {
      this.profile.rules = this.decay.applyDecayToRules(this.profile.rules);
    }

    // Cache rules in memory
    for (const rule of this.profile.rules) {
      this.memory.cacheRule(rule);
    }
  }

  // -- Config --

  getConfig(): TasteConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<TasteConfig>): void {
    this.config = { ...this.config, ...updates };
    this.symbolic.setThresholds(this.config.minConfidence, 0.85);
    this.neural?.setEnabled(this.config.neuralScoringEnabled);
    this.decay.setEnabled(this.config.decayEnabled);
    this.bandit?.setEnabled(this.config.banditEnabled);
    this.injector = new TastePromptInjector(this.config.maxInjectedRules, this.config.minConfidence);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  // -- Profile --

  getProfile(): TasteProfile {
    return this.profile;
  }

  async saveProfile(): Promise<void> {
    this.profile.bandit = this.bandit?.getState() ?? DEFAULT_BANDIT_STATE;
    await this.store.saveProfile(this.profilePath, this.profile);
  }

  getRules(): TasteRule[] {
    return [...this.profile.rules];
  }

  addRule(
    text: string,
    kind: TasteRuleKind = 'style',
    source: TasteRuleSource = 'manual',
    tags: string[] = [],
  ): TasteRule {
    const now = new Date().toISOString();
    const rule: TasteRule = {
      id: randomUUID(),
      kind,
      scope: 'project',
      text,
      confidence: source === 'manual' ? 0.9 : 0.4,
      weight: 1.0,
      source,
      positiveEvidence: 0,
      negativeEvidence: 0,
      createdAt: now,
      updatedAt: now,
      decayRate: 0.01,
      tags,
    };

    this.profile.rules.push(rule);
    this.memory.cacheRule(rule);
    this.collector.recordManualRule(text, kind);
    return rule;
  }

  removeRule(id: string): boolean {
    const idx = this.profile.rules.findIndex(r => r.id === id);
    if (idx === -1) return false;
    this.profile.rules.splice(idx, 1);
    this.memory.removeCachedRule(id);
    this.vectorStore.remove(id);
    return true;
  }

  // -- Events --

  getEventLog(): TasteEventLog {
    return this.eventLog;
  }

  getCollector(): TasteSignalCollector {
    return this.collector;
  }

  getAutoLearn(): AutoLearnEngine {
    return this.autoLearn;
  }

  /** Process events through auto-learn engine to detect patterns */
  processAutoLearn(): import('../auto-learn/AutoLearnEngine.js').TasteSuggestion[] {
    if (!this.config.autoLearn) return [];
    const events = this.eventLog.getRecentEvents(100);
    return this.autoLearn.processEvents(events);
  }

  // -- Signals --

  async recordAccept(prompt?: string, filePaths?: string[]): Promise<TasteEvent> {
    const event = await this.collector.recordAccept(prompt, filePaths);
    this.profile.stats.totalAccepts++;
    this.profile.stats.totalEvents++;
    await this.updateFromFeedback('accept', 1.0);
    // Auto-detect patterns from new signal
    this.processAutoLearn();
    return event;
  }

  async recordReject(prompt?: string, filePaths?: string[]): Promise<TasteEvent> {
    const event = await this.collector.recordReject(prompt, filePaths);
    this.profile.stats.totalRejects++;
    this.profile.stats.totalEvents++;
    await this.updateFromFeedback('reject', -1.0);
    // Auto-detect patterns from new signal
    this.processAutoLearn();
    return event;
  }

  async recordEdit(before: string, after: string, filePaths?: string[]): Promise<TasteEvent> {
    const event = await this.collector.recordEdit(before, after, filePaths);
    this.profile.stats.totalEdits++;
    this.profile.stats.totalEvents++;
    await this.updateFromFeedback('edit', event.reward);
    return event;
  }

  async recordTestResult(passed: boolean): Promise<TasteEvent> {
    const event = await this.collector.recordTestResult(passed);
    this.profile.stats.totalEvents++;
    return event;
  }

  async recordToolResult(success: boolean, toolName?: string): Promise<TasteEvent> {
    return this.collector.recordToolResult(success, toolName);
  }

  // -- Policy --

  evaluateOutput(output: string, rules?: TasteRule[], context?: BanditContext): PolicyDecision {
    return this.policy.evaluate(output, rules ?? this.profile.rules, context);
  }

  // -- Prompt Injection --

  getInjectedPrompt(): string | null {
    if (!this.config.enabled || !this.config.injectPrompts) return null;
    return this.injector.buildInjection(this.profile.rules, this.memory.getRecentEvents(20));
  }

  // -- Bandit --

  getBandit(): TasteBandit | null {
    return this.bandit;
  }

  getCurrentArm(): TasteBanditArm {
    return this.bandit?.selectArm() ?? 'minimal';
  }

  // -- Decay --

  getDecayEngine(): TasteDecay {
    return this.decay;
  }

  async applyDecay(): Promise<number> {
    if (!this.config.decayEnabled) return 0;
    const before = this.profile.rules.length;
    this.profile.rules = this.decay.applyDecayToRules(this.profile.rules);
    await this.saveProfile();
    return before - this.profile.rules.length;
  }

  // -- Import --

  async importRules(rules: TasteRule[]): Promise<number> {
    let count = 0;
    for (const rule of rules) {
      this.profile.rules.push({
        ...rule,
        id: randomUUID(),
        source: 'imported',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      count++;
    }
    await this.saveProfile();
    return count;
  }

  async exportRules(ruleIds?: string[]): Promise<TasteRule[]> {
    if (!ruleIds) return [...this.profile.rules];
    return this.profile.rules.filter(r => ruleIds.includes(r.id));
  }

  // -- Private helpers --

  private async updateFromFeedback(_type: string, reward: number): Promise<void> {
    if (!this.config.autoLearn) return;

    const arm = this.bandit?.selectArm();
    if (arm && this.config.banditEnabled) {
      this.bandit?.updateArm(arm, reward);
    }
    await this.saveProfile();
  }

  private getEventsPath(): string {
    return `${this.cwd}/.clew/taste/events.jsonl`;
  }
}
