import { toJSONSchema } from 'zod/v4';
import { jsonStringify } from '../slowOperations.js';
import { SettingsSchema } from './types.js';
export function generateSettingsJSONSchema() {
  try {
    const jsonSchema = toJSONSchema(SettingsSchema(), { unrepresentable: 'any' });
    return jsonStringify(jsonSchema, null, 2);
  } catch {
    return jsonStringify({ type: 'object', description: 'Settings schema unavailable' }, null, 2);
  }
}
