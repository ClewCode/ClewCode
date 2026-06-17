/**
 * Module-level flag tracking whether a background session is currently
 * foregrounded (attached). Used by App.tsx's Ctrl+Z handler to force-detach
 * even when a dialog has focus.
 *
 * Must be a separate tiny module — App.tsx is in the Ink rendering layer
 * and can't depend on React hooks directly.
 */
let active = false;
export function setForegroundedSessionActive(val) {
  active = val;
}
export function getForegroundedSessionActive() {
  return active;
}
