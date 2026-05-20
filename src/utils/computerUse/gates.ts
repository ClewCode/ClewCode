/**
 * Gates and configuration for Computer Use.
 * Replaces @ant/computer-use-mcp/types with our own types.
 */

import type { CoordinateMode, CuSubGates } from './hostAdapter.js';

type CuConfig = CuSubGates & {
  enabled: boolean;
  coordinateMode: CoordinateMode;
};

const DEFAULTS: CuConfig = {
  enabled: false,
  pixelValidation: false,
  clipboardPasteMultiline: true,
  mouseAnimation: true,
  hideBeforeAction: false,
  autoTargetDisplay: true,
  clipboardGuard: true,
  coordinateMode: 'pixels',
};

export function getChicagoEnabled(): boolean {
  // Allow env override: COMPUTER_USE_ENABLED=1 forces on
  if (process.env.COMPUTER_USE_ENABLED === '1') return true;
  if (process.env.COMPUTER_USE_ENABLED === '0') return false;
  return DEFAULTS.enabled;
}

export function getChicagoSubGates(): CuSubGates {
  const { enabled: _e, coordinateMode: _c, ...subGates } = readConfig();
  return subGates;
}

let frozenCoordinateMode: CoordinateMode | undefined;
export function getChicagoCoordinateMode(): CoordinateMode {
  frozenCoordinateMode ??= readConfig().coordinateMode;
  return frozenCoordinateMode;
}

function readConfig(): CuConfig {
  return { ...DEFAULTS };
}
