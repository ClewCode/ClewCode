import { readdir } from 'fs/promises';
import { join } from 'path';
import type { Command } from '../types/command.js';
import { DOT_CLEW } from '../utils/clewPaths.js';
import { logForDebugging } from '../utils/debug.js';
import { parseFrontmatter } from '../utils/frontmatterParser.js';
import { getFsImplementation } from '../utils/fsOperations.js';
import { extractDescriptionFromMarkdown } from '../utils/markdownConfigLoader.js';

/**
 * Simple skill loader for .claude/skills/ directory
 * Loads .md files as skills without requiring SKILL.md naming convention
 */
export async function loadProjectSkills(cwd: string): Promise<Command[]> {
  const fs = getFsImplementation();
  const skillsDir = join(cwd, DOT_CLEW, 'skills');
  const skills: Command[] = [];

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      // Only process .md files (not directories)
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }

      const skillPath = join(skillsDir, entry.name);
      const skillName = entry.name.replace(/\.md$/, '');

      try {
        const content = await fs.readFile(skillPath, { encoding: 'utf-8' });
        const { frontmatter, content: markdownContent } = parseFrontmatter(content, skillPath);

        // Parse description from frontmatter or extract from content
        const description = frontmatter.description ?? extractDescriptionFromMarkdown(markdownContent, 'Skill');

        // Parse when-to-use from frontmatter
        const whenToUse = frontmatter.when_to_use as string | undefined;

        // Create the skill command
        const skill: Command = {
          type: 'prompt',
          name: skillName,
          description,
          hasUserSpecifiedDescription: frontmatter.description !== undefined,
          allowedTools: [],
          argumentHint: undefined,
          argNames: undefined,
          whenToUse,
          version: undefined,
          model: undefined,
          disableModelInvocation: false,
          userInvocable: true,
          context: undefined,
          agent: undefined,
          effort: undefined,
          paths: undefined,
          contentLength: markdownContent.length,
          isHidden: false,
          progressMessage: 'running',
          userFacingName(): string {
            return frontmatter.name ? String(frontmatter.name) : skillName;
          },
          source: 'projectSettings',
          loadedFrom: 'skills',
          hooks: undefined,
          skillRoot: skillsDir,
          async getPromptForCommand() {
            return [{ type: 'text', text: markdownContent }];
          },
        };

        skills.push(skill);
        logForDebugging(`Loaded skill: ${skillName}`);
      } catch (error) {
        logForDebugging(`Failed to load skill ${entry.name}: ${error}`);
      }
    }

    logForDebugging(`Loaded ${skills.length} skills from ${skillsDir}`);
    return skills;
  } catch (_error) {
    // Skills directory doesn't exist or is inaccessible
    logForDebugging(`Skills directory not found: ${skillsDir}`);
    return [];
  }
}
