import { Router } from 'express';
import { ask } from '../controllers/agent.controller.js';
import { validate } from '../validators/validate.js';
import { askSchema } from '../validators/agent.validator.js';

const router = Router();

// POST /api/agent/ask — { question, history? } → { answer, outcome, steps, … }
router.post('/ask', validate({ body: askSchema }), ask);

export default router;
