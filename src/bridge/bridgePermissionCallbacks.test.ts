import { describe, expect, it } from 'bun:test';
import { isBridgePermissionResponse } from './bridgePermissionCallbacks.js';

describe('isBridgePermissionResponse type guard', () => {
  it('returns true for valid allow and deny responses', () => {
    expect(isBridgePermissionResponse({ behavior: 'allow' })).toBe(true);
    expect(isBridgePermissionResponse({ behavior: 'deny', message: 'Rejected by user' })).toBe(true);
    expect(
      isBridgePermissionResponse({
        behavior: 'allow',
        updatedInput: { path: 'src/main.ts' },
        updatedPermissions: [],
      }),
    ).toBe(true);
  });

  it('returns false for invalid objects, null, or wrong behavior values', () => {
    expect(isBridgePermissionResponse(null)).toBe(false);
    expect(isBridgePermissionResponse(undefined)).toBe(false);
    expect(isBridgePermissionResponse('allow')).toBe(false);
    expect(isBridgePermissionResponse(123)).toBe(false);
    expect(isBridgePermissionResponse({})).toBe(false);
    expect(isBridgePermissionResponse({ behavior: 'maybe' })).toBe(false);
    expect(isBridgePermissionResponse({ status: 'allow' })).toBe(false);
  });
});
