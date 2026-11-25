import { z } from 'zod';
import { requiredString } from './validate.js';
import { MAX_QUESTION_CHARS } from '../agent/agent.service.js';

// History is what the chat UI shows; the server trims it further (agent.service#sanitizeHistory).
const historyMessage = z.object({
  role: z.enum(['user', 'assistant'], { error: 'history role must be user or assistant' }),
  content: z.string({ error: 'history content must be a string' }).max(4000, 'history message is too long'),
});

export const askSchema = z.object({
  question: requiredString('question')
    .pipe(z.string().max(MAX_QUESTION_CHARS, `question must be at most ${MAX_QUESTION_CHARS} characters`)),
  history: z.array(historyMessage, { error: 'history must be an array' }).max(20, 'history is too long').optional(),
});
