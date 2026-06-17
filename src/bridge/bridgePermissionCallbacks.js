/** Type predicate for validating a parsed control_response payload
 *  as a BridgePermissionResponse. Checks the required `behavior`
 *  discriminant rather than using an unsafe `as` cast. */
function isBridgePermissionResponse(value) {
  if (!value || typeof value !== 'object') return false;
  return 'behavior' in value && (value.behavior === 'allow' || value.behavior === 'deny');
}

export { isBridgePermissionResponse };
