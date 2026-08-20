import { Router } from 'express';
import { handleWebhook } from '../controllers/telegram.controller.js';

const router = Router();

/**
 * POST /api/telegram/webhook
 *
 * Use in production when webhooks are preferred over polling.
 * Register with Telegram via:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/api/telegram/webhook
 */
router.post('/webhook', handleWebhook);

export default router;
