export const CONTEXT_RESTORE_TOOL_NAME = 'ContextRestore';

export const DESCRIPTION = `Bring back conversation content that was removed to fit the context window.

When context runs low, older tool results and conversation history are moved out of the window and replaced with a one-line stub that looks like:

  [evicted: Read src/query.ts — ~4.2k tokens — restore with ContextRestore("ev_a91f3c")]

Call this tool with that handle to get the original content back. Use it when you see such a stub and the content it names is something you still need — restoring is much cheaper and more reliable than re-running the original command, and unlike re-reading a file it gives you exactly what was there at the time.

Do not restore speculatively. Each restore puts those tokens back into the context window, and a per-turn limit applies; restore the one thing you need, not everything that was evicted.

Call with no handle to list what is currently available to restore.`;
