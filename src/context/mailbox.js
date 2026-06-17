import { createContext, useContext, useMemo } from 'react';
import { jsx as _jsx } from 'react/jsx-runtime';
import { Mailbox } from '../utils/mailbox.js';

const MailboxContext = createContext(undefined);
export function MailboxProvider({ children }) {
  const mailbox = useMemo(() => new Mailbox(), []);
  return _jsx(MailboxContext.Provider, { value: mailbox, children: children });
}
export function useMailbox() {
  const mailbox = useContext(MailboxContext);
  if (!mailbox) {
    throw new Error('useMailbox must be used within a MailboxProvider');
  }
  return mailbox;
}
