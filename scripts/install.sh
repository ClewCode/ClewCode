#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$HOME/.clew}"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info()  { printf "${GREEN}✓${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${NC} %s\n" "$*"; }
err()   { printf "${RED}✗${NC} %s\n" "$*" >&2; }

# ── Platform ─────────────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin|Linux|MINGW*|CYGWIN*|MSYS*) ;;
  *)            err "Unsupported OS: $OS (use install.ps1 on Windows)"; exit 1 ;;
esac

# ── Install bun if missing ──────────────────────────────────────────────────
if ! command -v bun &>/dev/null; then
  info "Bun not found — installing..."
  case "$OS" in
    Darwin|Linux)
      curl -fsSL https://bun.sh/install | bash
      # Source the updated profile so bun is in PATH for the rest of this script
      export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
      if [ -f "$BUN_INSTALL/env" ]; then
        # shellcheck source=/dev/null
        source "$BUN_INSTALL/env"
      fi
      ;;
  esac
  if ! command -v bun &>/dev/null; then
    err "Bun installed but not found in PATH. Restart your shell and try again."
    exit 1
  fi
  info "Bun $(bun --version) installed"
else
  info "Bun $(bun --version) found"
fi

# ── Install clew-code ───────────────────────────────────────────────────────
info "Installing clew-code via bun..."
# --ignore-scripts skips sharp (from @xenova/transformers) install script,
# which fails on Node.js <14 or missing build tools. clew imports sharp
# dynamically — it's only needed for image/ComputerUse features.
bun install -g clew-code --ignore-scripts

printf "\n${BOLD}Done!${NC} Opening a new terminal with ${BOLD}clew${NC} ready...\n"

# ── Open new terminal with clew ready ─────────────────────────────────────
case "$OS" in
  Darwin)
    osascript -e 'tell application "Terminal" to do script "clew"' &>/dev/null || true
    ;;
  Linux)
    # Try common terminal emulators
    for term in x-terminal-emulator gnome-terminal xterm konsole; do
      if command -v "$term" &>/dev/null; then
        ($term &) 2>/dev/null || true
        break
      fi
    done
    ;;
esac
