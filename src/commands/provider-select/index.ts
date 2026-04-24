import type { Command } from '../../commands.js'

const providerSelect = {
  type: 'local-jsx',
  name: 'provider',
  aliases: ['providers'],
  description: 'Show or change the active AI provider and model',
  argumentHint: '[list|get|set <provider> [model]|reset|models <provider>]',
  load: () => import('./provider-select.js'),
} satisfies Command

export default providerSelect
