import { z } from 'zod/v4';
import { lazySchema } from '../lazySchema.js';
const TodoStatusSchema = lazySchema(() => z.enum(['pending', 'in_progress', 'completed']));
export const TodoItemSchema = lazySchema(() => z.object({
    content: z.string().min(1, 'Content cannot be empty'),
    status: TodoStatusSchema(),
    activeForm: z.string().min(1, 'Active form cannot be empty'),
}));
export const TodoListSchema = lazySchema(() => z.array(TodoItemSchema()));
