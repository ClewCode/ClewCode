import { describe, it, expect } from 'vitest';
import {
  textToACPMessage,
  acpMessagesToPrompt,
  resultToACPMessage,
  extractTextFromMessage,
  isTextMessage,
} from '../ACPMessageConverter.js';

describe('ACPMessageConverter', () => {
  it('should convert text to ACP message', () => {
    const msg = textToACPMessage('user', 'Hello');
    expect(msg.role).toBe('user');
    expect(msg.parts[0].content).toBe('Hello');
    expect(msg.parts[0].content_type).toBe('text/plain');
  });

  it('should convert ACP messages to a prompt string', () => {
    const messages = [textToACPMessage('user', 'Hello'), textToACPMessage('user', 'How are you?')];
    const prompt = acpMessagesToPrompt(messages);
    expect(prompt).toContain('Hello');
    expect(prompt).toContain('How are you?');
  });

  it('should convert result to ACP message', () => {
    const msg = resultToACPMessage('Result text');
    expect(msg.role).toBe('agent');
    expect(extractTextFromMessage(msg)).toBe('Result text');
  });

  it('should detect text messages', () => {
    const txt = textToACPMessage('user', 'text');
    expect(isTextMessage(txt)).toBe(true);
  });

  it('should extract text from messages', () => {
    const msg = textToACPMessage('user', 'Hello world');
    expect(extractTextFromMessage(msg)).toBe('Hello world');
  });
});
