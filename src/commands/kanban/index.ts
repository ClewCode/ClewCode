import type { Command } from '../../commands.js'

const kanban = {
  type: 'local',
  name: 'kanban',
  description: 'Manage the semi-automatic agent Kanban board',
  argumentHint:
    'init | list | show | add | move | edit | delete | assign | block | unblock | conflicts | files | open | export',
  supportsNonInteractive: true,
  load: () => import('./kanban.js'),
} satisfies Command

export default kanban
