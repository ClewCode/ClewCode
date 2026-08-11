/**
 * /sessions — the session catalog.
 *
 * Opening an archived session is delegated to /resume via `nextInput` rather
 * than reimplemented here, so both paths restore a session the same way.
 */

import React from 'react';
import { SessionCatalogView } from '../../components/sessionCatalog/SessionCatalogView.js';
import type { LocalJSXCommandCall } from '../../types/command.js';

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const allProjects = /(^|\s)(--all|-a)(\s|$)/.test(args ?? '');
  return (
    <SessionCatalogView
      allProjects={allProjects}
      onDone={result => onDone(result, result ? { display: 'system' } : { display: 'skip' })}
      onResume={sessionId => onDone(undefined, { nextInput: `/resume ${sessionId}`, submitNextInput: true })}
    />
  );
};
