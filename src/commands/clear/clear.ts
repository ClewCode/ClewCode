import { getSessionId } from '../../bootstrap/state.js';
import type { LocalCommandCall } from '../../types/command.js';
import { saveCustomTitle } from '../../utils/sessionStorage.js';
import { clearConversation } from './conversation.js';

export const call: LocalCommandCall = async (args, context) => {
  // If a name was provided (e.g. /clear my-label), save it as a custom title
  // before clearing so the session shows up with that name in /resume
  const name = args?.trim();
  if (name) {
    // @ts-expect-error - Phase3 typecheck auto (TS error suppression)
    await saveCustomTitle(getSessionId(), name.replace(/\s+/g, ' ').trim());
  }
  await clearConversation(context);
  return { type: 'text', value: '' };
};
