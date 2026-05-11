import React from 'react';
import { Text } from '../../../ink.js';
import { FallbackPermissionRequest } from '../FallbackPermissionRequest.js';
import type { PermissionRequestProps } from '../PermissionRequest.js';

// Monitor tool uses the fallback permission request
// since it's read-only and low-risk
export function MonitorPermissionRequest(props: PermissionRequestProps) {
  return (
    <FallbackPermissionRequest
      {...props}
    />
  );
}

export default MonitorPermissionRequest;
