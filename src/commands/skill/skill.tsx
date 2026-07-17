import ansis from 'ansis';
import figures from 'figures';
import type React from 'react';
import { getCwdState } from '../../bootstrap/state.js';
import type { LocalJSXCommandContext } from '../../commands.js';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Text } from '../../ink.js';
import { loadProjectSkills as listProjectSkills } from '../../skills/loadProjectSkills.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode> {
  const cwd = getCwdState();
  const skillName = args?.trim();

  if (!skillName) {
    // List all skills
    const skills = await listProjectSkills(cwd);

    if (skills.length === 0) {
      const message = `No skills found in .clew/skills/`;
      onDone(message);
      return (
        <MessageResponse>
          <Text>{message}</Text>
        </MessageResponse>
      );
    }

    const skillList = skills
      .map(skill => {
        const name = ansis.bold(skill.name);
        const description = skill.description;
        const whenToUse = skill.whenToUse ? ansis.dim(`· ${skill.whenToUse}`) : '';
        return `${figures.pointer} ${name}: ${description} ${whenToUse}`;
      })
      .join('\n');

    const message = `Found ${skills.length} skill${skills.length > 1 ? 's' : ''}:\n\n${skillList}`;
    onDone(message);

    return (
      <MessageResponse>
        <Text>{message}</Text>
      </MessageResponse>
    );
  }

  // Show specific skill info
  const skills = await listProjectSkills(cwd);
  const skill = skills.find(s => s.name === skillName);

  if (!skill) {
    const message = `Skill not found: ${ansis.bold(skillName)}`;
    onDone(message);
    return (
      <MessageResponse>
        <Text>{message}</Text>
      </MessageResponse>
    );
  }

  const message = `${ansis.bold(skill.name)}\n${skill.description}${skill.whenToUse ? `\n\nWhen to use: ${skill.whenToUse}` : ''}`;
  onDone(message);

  return (
    <MessageResponse>
      <Text>{message}</Text>
    </MessageResponse>
  );
}
