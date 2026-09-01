import { describe, expect, test } from 'bun:test';
import { AskUserQuestionTool } from './AskUserQuestionTool.js';

describe('AskUserQuestionTool input', () => {
  test('accepts valid questions', () => {
    expect(
      AskUserQuestionTool.inputSchema.safeParse({
        questions: [
          {
            question: 'Continue?',
            header: 'Confirm',
            options: [
              { label: 'Yes', description: 'yes' },
              { label: 'No', description: 'no' },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  test('rejects empty questions', () => {
    expect(AskUserQuestionTool.inputSchema.safeParse({ questions: [] }).success).toBe(false);
  });
});
