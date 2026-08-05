import type { UUID } from 'node:crypto';

export type QueueOperation = 'enqueue' | 'dequeue' | 'remove' | 'popAll';

export type QueueOperationMessage = {
  type: 'queue-operation';
  operation: QueueOperation;
  timestamp: string;
  sessionId: UUID;
  content?: string;
};
