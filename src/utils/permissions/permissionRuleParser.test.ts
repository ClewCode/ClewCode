import { describe, expect, test } from 'bun:test';
import { asPermissionRuleStrings } from './permissionRuleParser.js';

describe('asPermissionRuleStrings', () => {
  test('keeps only string rules from a raw settings array', () => {
    expect(asPermissionRuleStrings(['Bash(npm test)', 42, null, 'FileRead'])).toEqual(['Bash(npm test)', 'FileRead']);
  });

  test('fails closed for malformed non-array permission buckets', () => {
    expect(asPermissionRuleStrings({ Bash: '*' })).toEqual([]);
    expect(asPermissionRuleStrings('Bash(*)')).toEqual([]);
    expect(asPermissionRuleStrings(undefined)).toEqual([]);
  });
});
