// Tiny external store bridging the AutoUpdater's version check to the REPL's
// startup update dialog. The AutoUpdater detects that a newer version exists;
// the REPL renders the choice (Update now / Keep / I'll update myself) through
// its focusedInputDialog machine. Keeping this decoupled avoids threading a
// callback through PromptInput → Notifications → AutoUpdaterWrapper.

type Listener = () => void;

// Latest version awaiting the user's choice (null when nothing pending).
let pendingVersion: string | null = null;
// Version the user confirmed to install — AutoUpdater watches this and runs the
// actual `npm install -g` (it owns the isUpdating footer state). Cleared once
// the install kicks off.
let confirmedVersion: string | null = null;
// Version the user already answered for this session — suppresses the 30-min
// interval from re-prompting the same version after Keep / I'll-update-myself.
let dismissedVersion: string | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

/** AutoUpdater calls this when a newer global-install version is available. */
export function setPendingUpdate(version: string | null): void {
  if (pendingVersion === version) return;
  pendingVersion = version;
  emit();
}

/** REPL calls this when the user picks "Update now" — AutoUpdater runs the install. */
export function confirmUpdate(version: string): void {
  dismissedVersion = version;
  confirmedVersion = version;
  pendingVersion = null;
  emit();
}

/** AutoUpdater consumes the confirmed version once, then clears it. */
export function takeConfirmedUpdate(): string | null {
  const v = confirmedVersion;
  confirmedVersion = null;
  return v;
}

/** REPL calls this when the user dismisses (Keep / manual) — don't re-ask this session. */
export function dismissPendingUpdate(version: string): void {
  dismissedVersion = version;
  if (pendingVersion !== null) {
    pendingVersion = null;
    emit();
  }
}

export function getPendingUpdate(): string | null {
  return pendingVersion;
}

export function getConfirmedUpdate(): string | null {
  return confirmedVersion;
}

export function isUpdateDismissed(version: string): boolean {
  return dismissedVersion === version;
}

export function subscribePendingUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
