import app from './app.js';
import { initDB } from './config/database.js';
import { initTelegramBot } from './services/telegram.service.js';
import { ensureTopicsExist } from './config/kafka.js';
import { initProducer } from './services/kafka.producer.js';
import { startLlmConsumer, startPersistenceConsumer } from './services/kafka.consumers.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

async function start() {
  try {
    await initDB();

    // Initialize Kafka Infrastructure
    await ensureTopicsExist();
    await initProducer();
    await startLlmConsumer();
    await startPersistenceConsumer();

    app.listen(env.port, () => {
      logger.info(`Backend server listening on http://localhost:${env.port}`);
      logger.info("Make sure Ollama is running locally with the configured model!");
    });

    if (env.telegram.botToken) {
      initTelegramBot(env.telegram.botToken);
    } else {
      logger.info('TELEGRAM_BOT_TOKEN not set — Telegram bot is disabled.');
    }
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
