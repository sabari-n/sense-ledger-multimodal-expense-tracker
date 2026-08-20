import { Kafka, logLevel } from 'kafkajs';
import { env } from './env.js';
import { logger } from './logger.js';

export const TOPICS = {
  AUDIO_INGESTION: env.kafka.topics.audioIngestion,
  IMAGE_INGESTION: env.kafka.topics.imageIngestion,
  TEXT_EXTRACTED: env.kafka.topics.textExtracted,
  EXPENSE_STRUCTURED: env.kafka.topics.expenseStructured,
};

export const kafka = new Kafka({
  clientId: 'spend-sync-backend',
  brokers: env.kafka.brokers,
  logLevel: logLevel.NOTHING,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

export async function ensureTopicsExist() {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const existing = await admin.listTopics();
    const topicsToCreate = Object.values(TOPICS).filter((t) => !existing.includes(t));
    console.log('topicsToCreate', topicsToCreate)
    if (topicsToCreate.length > 0) {
      await admin.createTopics({
        topics: topicsToCreate.map((t) => ({
          topic: t,
          numPartitions: 1,
          replicationFactor: 1,
        })),
      });
      logger.info(`[Kafka] Created topics: ${topicsToCreate.join(', ')}`);
    }
  } catch (err) {
    logger.error('[Kafka] Error ensuring topics exist:', err.message);
  } finally {
    await admin.disconnect();
  }
}
