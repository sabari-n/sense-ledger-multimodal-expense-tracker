import { getBot } from '../services/telegram.service.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { logger } from '../config/logger.js';

/**
 * POST /api/telegram/webhook
 *
 * Use in production when webhooks are preferred over polling.
 * Register with Telegram via:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/api/telegram/webhook
 */
export const handleWebhook = async (req, res, next) => {
  try {
    const bot = getBot();
    if (!bot) return errorResponse(res, 'Bot not initialised.', 503);
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    logger.error('[Telegram] Webhook error:', err);
    next(err);
  }
};
