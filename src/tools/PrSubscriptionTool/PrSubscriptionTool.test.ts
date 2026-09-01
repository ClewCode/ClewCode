import { describe, expect, test } from 'bun:test';
import { SubscribePrActivityTool } from './PrSubscriptionTool.js';

describe('PrSubscriptionTool input', () => {
  test('has inputSchema', () => {
    expect(SubscribePrActivityTool.inputSchema).toBeDefined();
    expect(typeof (SubscribePrActivityTool as any).inputSchema.safeParse).toBe('function');
  });
  test('has correct name', () => {
    expect(typeof SubscribePrActivityTool.name).toBe('string');
  });
});
