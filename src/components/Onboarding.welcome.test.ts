import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

test('first-run onboarding renders WelcomeV2 instead of LogoV2', () => {
  const source = readFileSync(new URL('./Onboarding.tsx', import.meta.url), 'utf8');
  expect(source).toContain("import { WelcomeV2 } from './LogoV2/WelcomeV2.js'");
  expect(source).toContain('<WelcomeV2 />');
  expect(source).not.toContain('<LogoV2');
});
