import { kafka, TOPICS } from '../config/kafka.js';
import { logger } from '../config/logger.js';
import { kafkaMessagesPublished, kafkaPublishDuration } from '../config/metrics.js';

let producer = null;

export async function initProducer() {
  if (producer) return producer;
  producer = kafka.producer();
  await producer.connect();
  logger.info('[Kafka] Producer connected.');
  return producer;
}

export async function publishEvent(topic, payload) {
  if (!producer) await initProducer();

  const message = {
    key: payload.eventId || payload.chatId?.toString() || Date.now().toString(),
    value: JSON.stringify({
      timestamp: new Date().toISOString(),
      ...payload,
    }),
  };

  const start = process.hrtime();
  try {
    await producer.send({
      topic,
      messages: [message],
    });

    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    kafkaPublishDuration.observe({ topic }, durationInSeconds);
    kafkaMessagesPublished.inc({ topic, status: 'success' });

    logger.info(`[Kafka Producer] Published event to [${topic}]: ${payload.eventId || payload.messageType}`);
  } catch (err) {
    kafkaMessagesPublished.inc({ topic, status: 'error' });
    throw err;
  }
}


export async function disconnectProducer() {
  if (producer) {
    await producer.disconnect();
    producer = null;
    logger.info('[Kafka] Producer disconnected.');
  }
}
