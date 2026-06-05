// Clew taste-1: Collect all signal types into a unified event stream

import { randomUUID } from 'crypto';
import { REWARD_VALUES, type TasteEvent } from '../core/Taste1Types.js';
import type { TasteEventLog } from '../storage/TasteEventLog.js';
import { AcceptRejectTracker } from './AcceptRejectTracker.js';
import { computeEditReward } from './EditDistanceReward.js';

export class TasteSignalCollector {
  private eventLog: TasteEventLog;
  private acceptReject: AcceptRejectTracker;
  private sessionId: string;

  constructor(eventLog: TasteEventLog, sessionId: string) {
    this.eventLog = eventLog;
    this.acceptReject = new AcceptRejectTracker();
    this.sessionId = sessionId;
  }

  getAcceptRejectTracker(): AcceptRejectTracker {
    return this.acceptReject;
  }

  async recordAccept(prompt?: string, filePaths?: string[], model?: string, provider?: string): Promise<TasteEvent> {
    const event: TasteEvent = {
      id: randomUUID(),
      type: 'accept',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      prompt,
      filePaths,
      model,
      provider,
      reward: REWARD_VALUES.accept,
    };
    this.acceptReject.record({ type: 'accept', timestamp: event.timestamp, prompt, filePaths, model, provider });
    await this.eventLog.append(event);
    return event;
  }

  async recordReject(prompt?: string, filePaths?: string[], model?: string, provider?: string): Promise<TasteEvent> {
    const event: TasteEvent = {
      id: randomUUID(),
      type: 'reject',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      prompt,
      filePaths,
      model,
      provider,
      reward: REWARD_VALUES.reject,
    };
    this.acceptReject.record({ type: 'reject', timestamp: event.timestamp, prompt, filePaths, model, provider });
    await this.eventLog.append(event);
    return event;
  }

  async recordManualRule(ruleText: string, kind?: string): Promise<TasteEvent> {
    const event: TasteEvent = {
      id: randomUUID(),
      type: 'manual_rule',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      prompt: ruleText,
      reward: REWARD_VALUES.manual_rule,
      metadata: { kind },
    };
    await this.eventLog.append(event);
    return event;
  }

  async recordEdit(before: string, after: string, filePaths?: string[]): Promise<TasteEvent> {
    const { reward, category, stats } = computeEditReward({ before, after });
    const event: TasteEvent = {
      id: randomUUID(),
      type: 'edit',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      filePaths,
      before,
      after,
      reward,
      metadata: { category, changeRatio: stats.changeRatio },
    };
    await this.eventLog.append(event);
    return event;
  }

  async recordToolResult(success: boolean, toolName?: string, metadata?: Record<string, unknown>): Promise<TasteEvent> {
    const event: TasteEvent = {
      id: randomUUID(),
      type: success ? 'tool_success' : 'tool_failure',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      reward: success ? REWARD_VALUES.tool_success : REWARD_VALUES.tool_failure,
      metadata: { ...metadata, toolName },
    };
    await this.eventLog.append(event);
    return event;
  }

  async recordTestResult(passed: boolean, filePath?: string): Promise<TasteEvent> {
    const event: TasteEvent = {
      id: randomUUID(),
      type: passed ? 'test_pass' : 'test_fail',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      filePaths: filePath ? [filePath] : undefined,
      reward: passed ? REWARD_VALUES.test_pass : REWARD_VALUES.test_fail,
    };
    await this.eventLog.append(event);
    return event;
  }

  async recordLintResult(passed: boolean, filePath?: string): Promise<TasteEvent> {
    const event: TasteEvent = {
      id: randomUUID(),
      type: passed ? 'lint_pass' : 'lint_fail',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      filePaths: filePath ? [filePath] : undefined,
      reward: passed ? REWARD_VALUES.lint_pass : REWARD_VALUES.lint_fail,
    };
    await this.eventLog.append(event);
    return event;
  }
}
