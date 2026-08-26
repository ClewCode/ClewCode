/**
 * /sessions — the session catalog.
 *
 * Opening an archived session is delegated to /resume via `nextInput` rather
 * than reimplemented here, so both paths restore a session the same way.
 */

import type { LocalJSXCommandCall } from '../../types/command.js';

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const allProjects = /(^|\s)(--all|-a)(\s|$)/.test(args ?? '');
  _context.setAppState(previous => ({
    ...previous,
    sessionCatalogOpen: true,
    sessionCatalogAllProjects: allProjects,
  }));
  // The REPL owns the full-screen route. Returning null is intentional: it
  // prevents the command runner from mounting this page in the local-JSX
  // modal slot as well.
  onDone(undefined, { display: 'skip' });
  return null;
};
