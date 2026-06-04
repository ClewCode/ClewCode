import type { RunStore } from './runStore.js';

export class ReportBuilder {
  private runStore: RunStore;

  constructor(runStore: RunStore) {
    this.runStore = runStore;
  }

  async build(runId: string): Promise<string> {
    const run = await this.runStore.loadRun(runId);
    const state = await this.runStore.loadState(runId);
    const events = await this.runStore.loadEvents(runId);

    const startEvent = events.find(e => e.type === 'run.started');
    const endEvent = events.find(e => e.type === 'run.completed' || e.type === 'run.failed');

    const startTime = startEvent ? new Date(startEvent.timestamp) : new Date(run.createdAt);
    const endTime = endEvent ? new Date(endEvent.timestamp) : new Date(run.updatedAt);
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationSec = (durationMs / 1000).toFixed(1);

    // Format Markdown Report
    const lines: string[] = [];
    lines.push(`# Clew Code Agent Run Report: ${runId}`);
    lines.push(``);
    lines.push(`## Run Metadata`);
    lines.push(`- **Task:** ${run.task}`);
    lines.push(`- **Workflow:** ${run.workflow}`);
    lines.push(`- **Status:** \`${run.status.toUpperCase()}\``);
    lines.push(`- **Total Steps Taken:** ${state.step} / ${run.budget.maxSteps}`);
    lines.push(`- **Duration:** ${durationSec} seconds`);
    lines.push(`- **Created At:** ${run.createdAt}`);
    lines.push(`- **Updated At:** ${run.updatedAt}`);
    lines.push(``);

    lines.push(`## Execution Summary`);
    if (state.taskSummary) {
      lines.push(state.taskSummary);
    } else {
      lines.push(`No summary was provided by the agents.`);
    }
    lines.push(``);

    lines.push(`## Changed Files`);
    if (state.changedFiles && state.changedFiles.length > 0) {
      for (const file of state.changedFiles) {
        lines.push(`- \`${file}\``);
      }
    } else {
      lines.push(`No files were modified during this run.`);
    }
    lines.push(``);

    lines.push(`## Execution Log (Handoffs & Actions)`);
    lines.push(`| Timestamp | Event Type | Agent | Info |`);
    lines.push(`| --- | --- | --- | --- |`);

    for (const event of events) {
      let info = '';
      if (event.type === 'run.started') {
        info = `Started run for task: "${run.task}"`;
      } else if (event.type === 'run.completed') {
        info = `Run completed successfully.`;
      } else if (event.type === 'run.failed') {
        info = `Run failed: ${event.data?.summary || 'Unknown error'}`;
      } else if (event.type === 'agent.started') {
        info = `Active agent set to **${event.agent}**`;
      } else if (event.type === 'handoff.created') {
        info = `Handoff from **${event.data?.from}** to **${event.data?.to}** (Reason: _${event.data?.reason || ''}_)`;
      } else if (event.type === 'tool.completed') {
        info = `Executed tool \`${event.tool}\``;
      } else if (event.type === 'approval.requested') {
        info = `Requested user approval for \`${event.tool}\` (Risk: **${event.data?.risk}**)`;
      } else if (event.type === 'approval.approved') {
        info = `User approved execution for approval ID \`${event.data?.approvalId}\``;
      } else if (event.type === 'approval.denied') {
        info = `User denied execution for approval ID \`${event.data?.approvalId}\``;
      } else {
        continue; // Skip noise events like llm.requested/completed to keep report neat
      }

      const time = new Date(event.timestamp).toLocaleTimeString();
      lines.push(`| ${time} | \`${event.type}\` | ${event.agent || '-'} | ${info} |`);
    }

    lines.push(``);
    return lines.join('\n');
  }
}
