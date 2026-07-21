import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getAutoMemPath } from '../../memdir/paths.js';
import { proposeMemory } from '../../memory/pending.js';
import { getMemoryWorkspaceStatus } from '../../memory/workspace.js';
import { logForDebugging } from '../../utils/debug.js';
import { errorMessage } from '../../utils/errors.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import { logError } from '../../utils/log.js';
import { getDefaultSonnetModel } from '../../utils/model/model.js';
import { getSessionMemoryPath } from '../../utils/permissions/filesystem.js';
import { sideQuery } from '../../utils/sideQuery.js';

// Keep track of the last consolidated content hash or text to avoid redundant runs
let lastConsolidatedContent = '';

/**
 * Parses the session memory file and extracts content from specific sections.
 */
export function parseNotesSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentSection) {
        sections[currentSection.slice(2).trim()] = currentContent.join('\n').trim();
      }
      currentSection = line;
      currentContent = [];
    } else {
      // Skip the template instruction lines (which start and end with underscore)
      if (line.trim().startsWith('_') && line.trim().endsWith('_')) {
        continue;
      }
      currentContent.push(line);
    }
  }

  if (currentSection) {
    sections[currentSection.slice(2).trim()] = currentContent.join('\n').trim();
  }

  return sections;
}

interface ConsolidatedObservation {
  fact: string;
  category: 'user' | 'project' | 'feedback' | 'agent';
  why: string;
}

/**
 * Consolidates learning sections from summary.md into long-term memories.
 */
export async function consolidateSessionMemory(): Promise<void> {
  const fs = getFsImplementation();
  const sessionMemoryPath = getSessionMemoryPath();

  // 1. Read the session memory summary
  let summaryContent = '';
  try {
    summaryContent = await fs.readFile(sessionMemoryPath, { encoding: 'utf-8' });
  } catch (_err) {
    // Session memory file doesn't exist or is not readable yet, skip
    return;
  }

  // Prevent redundant runs if content has not changed
  if (summaryContent === lastConsolidatedContent) {
    return;
  }

  const sections = parseNotesSections(summaryContent);
  const learnings = sections['Learnings'] || '';
  const corrections = sections['Errors & Corrections'] || '';
  const documentation = sections['Codebase and System Documentation'] || '';

  // If there are no substantial content to consolidate, skip
  if (!learnings.trim() && !corrections.trim() && !documentation.trim()) {
    return;
  }

  logForDebugging('[Memory Consolidation] Starting consolidation of session notes...');

  try {
    // 2. Fetch existing memories to avoid duplicates
    const autoMemPath = getAutoMemPath();
    const sessionLearningsPath = join(autoMemPath, 'session_learnings.md');
    let existingMemoryContent = '';
    try {
      existingMemoryContent = await fs.readFile(sessionLearningsPath, { encoding: 'utf-8' });
    } catch {
      // File doesn't exist yet, which is fine
    }

    // 3. Formulate prompt for LLM to extract clean observations
    const systemPrompt = `You are a memory consolidation assistant. Your task is to analyze the session notes and extract general, persistent facts, rules, user preferences, or error corrections that should be stored in long-term memory across sessions.
Extract only generic observations that remain true in future sessions (e.g. 'the project uses Bun', 'to fix X error, run Y', 'the user prefers Vanilla CSS over Tailwind').
Do not extract session-specific worklog details or temporary notes.
Avoid duplicates if the fact is already mentioned in the existing memories.

Classify each fact into one of these categories:
- 'user': User preferences or guidelines
- 'project': General codebase architecture/project information
- 'feedback': Error corrections or developer mistakes to avoid
- 'agent': Specific instructions for assistant agents`;

    const userMessage = `Existing memories:
<existing_memories>
${existingMemoryContent || '(none yet)'}
</existing_memories>

New session notes to consolidate:
<learnings>
${learnings}
</learnings>

<errors_and_corrections>
${corrections}
</errors_and_corrections>

<codebase_documentation>
${documentation}
</codebase_documentation>

Extract the new long-term facts/observations that should be added.`;

    const result = await sideQuery({
      model: getDefaultSonnetModel(),
      system: systemPrompt,
      skipSystemPromptPrefix: true,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      max_tokens: 1000,
      output_format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            observations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fact: {
                    type: 'string',
                    description: 'The extracted persistent fact or rule. Be detailed and specific.',
                  },
                  category: {
                    type: 'string',
                    enum: ['user', 'project', 'feedback', 'agent'],
                    description: 'The category of the memory.',
                  },
                  why: {
                    type: 'string',
                    description: 'Short explanation of why this observation is general and persistent.',
                  },
                },
                required: ['fact', 'category', 'why'],
                additionalProperties: false,
              },
            },
          },
          required: ['observations'],
          additionalProperties: false,
        },
      },
      querySource: 'session_memory',
    });

    const textBlock = result.content.find(block => block.type === 'text');
    if (textBlock?.type !== 'text') {
      return;
    }

    const parsed: { observations: ConsolidatedObservation[] } = JSON.parse(textBlock.text);
    const observations = parsed.observations || [];

    if (observations.length === 0) {
      lastConsolidatedContent = summaryContent;
      return;
    }

    logForDebugging(`[Memory Consolidation] Extracted ${observations.length} new observations.`);

    // 4. Save to User Persistent Auto-Memory
    await mkdir(autoMemPath, { recursive: true });

    // Group and format observations
    let userFacts = '';
    let projectFacts = '';
    let feedbackFacts = '';
    let agentFacts = '';
    const MAX_OBSERVATIONS = 1000; // BUG #7: Cap total observations to prevent memory growth
    const MAX_FACT_BYTES = 50_000_000; // 50MB cap on total content

    let totalBytes = 0;
    let observationCount = 0;

    for (const obs of observations) {
      if (observationCount >= MAX_OBSERVATIONS) break;
      const formatted = `- ${obs.fact}\n`;
      const addedBytes = new TextEncoder().encode(formatted).length;
      if (totalBytes + addedBytes > MAX_FACT_BYTES) break;

      totalBytes += addedBytes;
      observationCount++;
      if (obs.category === 'user') userFacts += formatted;
      else if (obs.category === 'project') projectFacts += formatted;
      else if (obs.category === 'feedback') feedbackFacts += formatted;
      else if (obs.category === 'agent') agentFacts += formatted;
    }

    // Build the updated markdown content
    let updatedContent = existingMemoryContent || '# Consolidated Session Learnings\n\n';

    if (userFacts) {
      if (!updatedContent.includes('## User Preferences')) {
        updatedContent += '\n## User Preferences\n';
      }
      updatedContent += userFacts;
    }
    if (projectFacts) {
      if (!updatedContent.includes('## Project Overview')) {
        updatedContent += '\n## Project Overview\n';
      }
      updatedContent += projectFacts;
    }
    if (feedbackFacts) {
      if (!updatedContent.includes('## Feedback & Corrections')) {
        updatedContent += '\n## Feedback & Corrections\n';
      }
      updatedContent += feedbackFacts;
    }
    if (agentFacts) {
      if (!updatedContent.includes('## Agent Instructions')) {
        updatedContent += '\n## Agent Instructions\n';
      }
      updatedContent += agentFacts;
    }

    await writeFile(sessionLearningsPath, `${updatedContent.trim()}\n`, 'utf-8');
    logForDebugging(`[Memory Consolidation] Saved observations directly to user Auto-Memory: ${sessionLearningsPath}`);

    // 5. Propose to Workspace Memory (if initialized)
    const cwd = process.cwd();
    const workspaceStatus = getMemoryWorkspaceStatus(cwd);
    if (workspaceStatus.initialized) {
      for (const obs of observations) {
        // Propose to local workspace pending queue (except private user settings)
        if (obs.category !== 'user') {
          await proposeMemory(cwd, obs.fact, obs.category);
          logForDebugging(`[Memory Consolidation] Proposed fact to workspace pending: "${obs.fact}"`);
        }
      }
    }

    // Update the last consolidated cache
    lastConsolidatedContent = summaryContent;
  } catch (err) {
    logError(new Error(`Memory Consolidation failed: ${errorMessage(err)}`));
  }
}
