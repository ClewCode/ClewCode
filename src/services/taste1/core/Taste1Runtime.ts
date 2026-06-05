// Clew taste-1: Main runtime that orchestrates all subsystems

import { randomUUID } from 'crypto';
import { TastePromptInjector } from '../prompt/TastePromptInjector.js';
import { TasteSignalCollector } from '../signals/TasteSignalCollector.js';
import { TasteEventLog } from '../storage/TasteEventLog.js';
import { TasteProfileStore } from '../storage/TasteProfileStore.js';
import { TasteVectorStore } from '../storage/TasteVectorStore.js';
import { type BanditContext, Taste1Bandit } from './Taste1Bandit.js';
import { Taste1Decay } from './Taste1Decay.js';
import { Taste1Memory } from './Taste1Memory.js';
import { Taste1NeuralScorer } from './Taste1NeuralScorer.js';
import { type PolicyDecision, Taste1Policy } from './Taste1Policy.js';
import { Taste1SymbolicEngine } from './Taste1SymbolicEngine.js';
import {
  DEFAULT_BANDIT_STATE,
  DEFAULT_TASTE1_CONFIG,
  type Taste1Config,
  type TasteBanditArm,
  type TasteEvent,
  type TasteProfile,
  type TasteRule,
  type TasteRuleKind,
  type TasteRuleSource,
} from './Taste1Types.js';

export class Taste1Runtime {
  private profile: TasteProfile;
  private profilePath: string;
  private cwd: string;
  private config: Taste1Config;
  private symbolic: Taste1SymbolicEngine;
  private neural: Taste1NeuralScorer | null;
  private bandit: Taste1Bandit | null;
  private memory: Taste1Memory;
  private decay: Taste1Decay;
  private policy: Taste1Policy;
  private collector: TasteSignalCollector;
  private eventLog: TasteEventLog;
  private vectorStore: TasteVectorStore;
  private injector: TastePromptInjector;
  private store: TasteProfileStore;

  constructor(config?: Partial<Taste1Config>) {
    this.config = { ...DEFAULT_TASTE1_CONFIG, ...config };
    this.cwd = process.cwd();
    this.profilePath = '';
    this.sessionId = '';
    this.memory = new Taste1Memory();
    this.vectorStore = new TasteVectorStore();
    this.eventLog = new TasteEventLog();
    this.symbolic = new Taste1SymbolicEngine(this.config.minConfidence, 0.85);
    this.neural = new Taste1NeuralScorer(this.vectorStore, this.config.neuralScoringEnabled);
    this.bandit = new Taste1Bandit(undefined, 0.2, this.config.banditEnabled);
    this.decay = new Taste1Decay(30, this.config.decayEnabled);
    this.policy = new Taste1Policy(this.symbolic, this.neural, this.bandit, this.config);
    this.collector = new TasteSignalCollector(this.eventLog, '');
    this.injector = new TastePromptInjector(this.config.maxInjectedRules, this.config.minConfidence);
    this.store = new TasteProfileStore();
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

  getConfig(): Taste1Config {
    return { ...this.config };
  }

  updateConfig(updates: Partial<Taste1Config>): void {
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

  // -- Signals --

  async recordAccept(prompt?: string, filePaths?: string[]): Promise<TasteEvent> {
    const event = await this.collector.recordAccept(prompt, filePaths);
    this.profile.stats.totalAccepts++;
    this.profile.stats.totalEvents++;
    await this.updateFromFeedback('accept', 1.0);
    return event;
  }

  async recordReject(prompt?: string, filePaths?: string[]): Promise<TasteEvent> {
    const event = await this.collector.recordReject(prompt, filePaths);
    this.profile.stats.totalRejects++;
    this.profile.stats.totalEvents++;
    await this.updateFromFeedback('reject', -1.0);
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

  getBandit(): Taste1Bandit | null {
    return this.bandit;
  }

  getCurrentArm(): TasteBanditArm {
    return this.bandit?.selectArm() ?? 'minimal';
  }

  // -- Decay --

  getDecayEngine(): Taste1Decay {
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
    return `${this.cwd}/.clew/taste1/events.jsonl`;
  }
}
