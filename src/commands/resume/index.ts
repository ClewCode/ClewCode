import type { Command } from '../../commands.js';

const resume: Command = {
  type: 'local-jsx',
  name: 'resume',
  description: 'Resume a previous conversation',
  aliases: ['continue'],
  argumentHint: '[conversation id or search term or number of messages]',
  load: () => import('./resume.js'),
};

export default resume;
