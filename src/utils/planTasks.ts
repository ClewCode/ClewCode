import { logError } from './log.js';
import { createTask, getTaskListId, listTasks, type Task } from './tasks.js';

export type ParsedPlanTask = {
  subject: string;
  description: string;
  group: string;
  groupOrder?: number;
};

// Sections that typically contain background or non-actionable discussion
const NON_ACTIONABLE_SECTION_REGEX =
  /^(user review required|open questions|background|context|problem|summary|goal|overview|motivation)/i;

// Sections that represent verification / testing
const VERIFICATION_SECTION_REGEX = /^(verification|test|testing|validation|automated tests|manual verification)/i;

/**
 * Clean markdown markup from a subject string for clean terminal display.
 */
function cleanSubject(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link text](url) -> link text
    .replace(/`([^`]+)`/g, '$1') // `code` -> code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** -> bold
    .replace(/\*([^*]+)\*/g, '$1') // *italic* -> italic
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1') // _underline_ -> underline
    .trim();
}

/**
 * Extract actionable tasks from a Markdown implementation plan.
 *
 * Recognizes:
 * 1. Checklists: `- [ ] Task description` or `* [ ] Task description`
 * 2. File action headers: `#### [MODIFY] path/to/file` or `#### [NEW] path/to/file`
 * 3. Numbered steps: `1. Step description` under implementation sections
 * 4. Step headings: `### Step 1: Description`
 * 5. Bullet items under actionable sections (when no checklists exist)
 */
export function extractTasksFromPlan(planContent: string): ParsedPlanTask[] {
  if (!planContent || typeof planContent !== 'string') {
    return [];
  }

  const lines = planContent.split(/\r?\n/);
  const tasks: ParsedPlanTask[] = [];

  let currentH2 = 'Execution';
  let currentH3 = '';
  let inNonActionableSection = false;
  let groupOrder = 1;

  // First pass: check if plan contains explicit checklists
  const hasChecklists = lines.some(l => /^\s*[-*]\s+\[[ xX]\]\s+/.test(l));
  // Check if plan contains [MODIFY]/[NEW]/[DELETE] file actions
  const hasFileActions = lines.some(l => /^\s*#{3,4}\s+\[(MODIFY|NEW|DELETE)\]/i.test(l));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    // Detect H2 headings
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      const heading = cleanSubject(h2Match[1]!).trim();
      currentH2 = heading;
      currentH3 = '';
      inNonActionableSection = NON_ACTIONABLE_SECTION_REGEX.test(heading);
      if (VERIFICATION_SECTION_REGEX.test(heading)) {
        groupOrder = 99; // Verification usually comes last
      } else {
        groupOrder++;
      }
      continue;
    }

    // Detect H3 headings
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      currentH3 = cleanSubject(h3Match[1]!).trim();
      // If the H3 is explicitly a step (e.g. "### Step 1: ...")
      const stepMatch = currentH3.match(/^Step\s+\d+[:.]?\s*(.+)$/i);
      if (stepMatch && !inNonActionableSection) {
        tasks.push({
          subject: cleanSubject(stepMatch[1] || currentH3),
          description: currentH3,
          group: currentH2,
          groupOrder,
        });
      }
      continue;
    }

    if (inNonActionableSection) {
      continue;
    }

    const group = currentH2 || 'Execution';

    // 1. Checklist items: `- [ ] ...` or `* [ ] ...`
    const checklistMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checklistMatch) {
      const rawText = checklistMatch[2]!;
      const subject = cleanSubject(rawText);
      if (subject.length > 0) {
        tasks.push({
          subject,
          description: rawText,
          group,
          groupOrder,
        });
      }
      continue;
    }

    // 2. File action headers: `#### [MODIFY] file` / `#### [NEW] file`
    const fileActionMatch = line.match(/^#{3,4}\s+\[(MODIFY|NEW|DELETE)\]\s+(.+)$/i);
    if (fileActionMatch) {
      const action = fileActionMatch[1]!.toUpperCase();
      const fileTarget = cleanSubject(fileActionMatch[2]!);
      tasks.push({
        subject: `[${action}] ${fileTarget}`,
        description: `${action} ${fileTarget}`,
        group: currentH3 || group,
        groupOrder,
      });
      continue;
    }

    // 3. Numbered steps under actionable section: `1. ...` (if no checklists)
    if (!hasChecklists && !hasFileActions) {
      const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
      if (numberedMatch) {
        const rawText = numberedMatch[1]!;
        const subject = cleanSubject(rawText.split(/[.:\n]/)[0] ?? rawText);
        tasks.push({
          subject: subject.slice(0, 100),
          description: rawText,
          group,
          groupOrder,
        });
        continue;
      }

      // 4. Top-level bullet items in actionable section
      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      if (bulletMatch && !line.startsWith('- [') && !line.startsWith('* [')) {
        const rawText = bulletMatch[1]!;
        const isActionableSection =
          /^(proposed changes|implementation|execution|tasks|steps|verification|testing)/i.test(currentH2) ||
          /^(automated tests|manual verification)/i.test(currentH3);
        if (isActionableSection) {
          const subject = cleanSubject(rawText.split(/[.:\n]/)[0] ?? rawText);
          tasks.push({
            subject: subject.slice(0, 100),
            description: rawText,
            group: currentH3 || group,
            groupOrder,
          });
        }
      }
    }
  }

  return tasks;
}

/**
 * Populate tasks from plan content into the session task store (tasksV2).
 * Skips items that already exist by subject to prevent duplicate tasks.
 *
 * @returns Array of created task IDs
 */
export async function populateTasksFromPlan(
  planContent: string,
  taskListId: string = getTaskListId(),
): Promise<string[]> {
  try {
    const parsed = extractTasksFromPlan(planContent);
    if (parsed.length === 0) {
      return [];
    }

    let existingTasks: Task[] = [];
    try {
      existingTasks = await listTasks(taskListId);
    } catch {
      existingTasks = [];
    }

    const existingSubjects = new Set(existingTasks.map(t => t.subject.toLowerCase().trim()));
    const createdIds: string[] = [];

    for (const item of parsed) {
      const normalizedSubject = item.subject.toLowerCase().trim();
      if (existingSubjects.has(normalizedSubject)) {
        continue;
      }
      existingSubjects.add(normalizedSubject);

      const id = await createTask(taskListId, {
        subject: item.subject,
        description: item.description,
        status: 'pending',
        blocks: [],
        blockedBy: [],
        metadata: {
          fromPlan: true,
          group: item.group,
          groupOrder: item.groupOrder,
        },
      });
      createdIds.push(id);
    }

    return createdIds;
  } catch (error) {
    logError(error);
    return [];
  }
}
