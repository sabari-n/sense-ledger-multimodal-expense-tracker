import { kafka, TOPICS } from '../config/kafka.js';
import { publishEvent } from './kafka.producer.js';
import { extractWithLLM } from './llm.service.js';

import { EXPENSE_PROMPT } from '../utils/constants.js';
import * as expenseRepo from '../repositories/expense.repository.js';
import { resolveAccountName } from '../repositories/account.repository.js';
import { resolveCategoryName } from '../repositories/category.repository.js';
import { getBot } from './telegram.service.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { kafkaMessagesConsumed, kafkaConsumerDuration } from '../config/metrics.js';

let llmConsumer = null;
let persistenceConsumer = null;


/**
 * Format a saved expense row into a Telegram markdown message.
 */
function formatExpenseMessage(expense, originalText = null, timings = null) {
  const emojiMap = { income: '💰', transfer: '🔄', expense: '💸' };
  const signMap = { income: '+', transfer: '↔', expense: '-' };
  const emoji = emojiMap[expense.transaction_type] || '💸';
  const sign = signMap[expense.transaction_type] || '-';
  const currencySymbol = env.defaults.currencySymbol || '₹';
  const lines = [
    `${emoji} *Transaction Recorded!*`,
    '',
    `*Amount:* ${sign}${currencySymbol}${expense.amount}`,
    `*Category:* ${expense.category}${expense.subcategory ? ` › ${expense.subcategory}` : ''}`,
    `*Account:* ${expense.account}`,
  ];

  if (expense.transaction_type === 'transfer' && expense.to_account) {
    lines.push(`*To Account:* ${expense.to_account}`);
  }

  lines.push(
    `*Type:* ${expense.transaction_type}`,
    `*Date:* ${new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
  );

  if (originalText) {
    lines.push('', `_"${originalText}"_`);
  }

  // Display processing duration summary
  if (timings && timings.totalDurationMs) {
    const totalSec = (timings.totalDurationMs / 1000).toFixed(2);
    const breakdown = [];
    if (timings.whisperMs) breakdown.push(`Whisper ${(timings.whisperMs / 1000).toFixed(2)}s`);
    if (timings.ocrMs) breakdown.push(`OCR ${(timings.ocrMs / 1000).toFixed(2)}s`);
    if (timings.llmMs) breakdown.push(`LLM ${(timings.llmMs / 1000).toFixed(2)}s`);
    if (timings.dbMs) breakdown.push(`DB ${(timings.dbMs / 1000).toFixed(2)}s`);

    const breakdownStr = breakdown.length > 0 ? ` (${breakdown.join(' · ')})` : '';
    lines.push('', `⏱️ _Processed in ${totalSec}s${breakdownStr}_`);
  }

  return lines.join('\n');
}

/**
 * Consumer 1: LLM Worker
 * Listens to `text-extracted-events`, calls Ollama to extract transaction schema,
 * and publishes result to `expense-structured-events`.
 */
export async function startLlmConsumer() {
  llmConsumer = kafka.consumer({ groupId: 'llm-extraction-group' });
  await llmConsumer.connect();
  await llmConsumer.subscribe({ topic: TOPICS.TEXT_EXTRACTED, fromBeginning: false });

  logger.info('[Kafka Consumer] LLM Worker started.');

  await llmConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const start = process.hrtime();
      try {
        const payload = JSON.parse(message.value.toString());
        logger.info(`[LLM Worker] Processing text for event ${payload.eventId}`);

        if (payload.chatId && payload.statusMsgId) {
          const bot = getBot();
          if (bot) {
            await bot.editMessageText('🤖 Extracting expense details with local LLM…', {
              chat_id: payload.chatId, message_id: payload.statusMsgId,
            }).catch(() => { });
          }
        }

        // Call Ollama LLM with timing
        const llmStart = Date.now();
        const prompt = await EXPENSE_PROMPT(payload.rawText);
        const extractedData = await extractWithLLM(payload.rawText, prompt);
        const llmMs = Date.now() - llmStart;

        const timings = payload.timings || {};
        timings.llmMs = llmMs;

        logger.info(`[LLM Worker] Extracted data in ${(llmMs / 1000).toFixed(2)}s: ${JSON.stringify(extractedData)}`);

        // Publish to expense-structured-events
        await publishEvent(TOPICS.EXPENSE_STRUCTURED, {
          ...payload,
          extractedData,
          timings,
        });

        const diff = process.hrtime(start);
        const durationInSeconds = diff[0] + diff[1] / 1e9;
        kafkaConsumerDuration.observe({ topic, consumer_group: 'llm-extraction-group', status: 'success' }, durationInSeconds);
        kafkaMessagesConsumed.inc({ topic, consumer_group: 'llm-extraction-group', status: 'success' });
      } catch (err) {
        kafkaConsumerDuration.observe({ topic, consumer_group: 'llm-extraction-group', status: 'error' }, getDuration(start));
        kafkaMessagesConsumed.inc({ topic, consumer_group: 'llm-extraction-group', status: 'error' });
        logger.error('[LLM Worker] Error processing message:', err);
      }
    },
  });
}

function getDuration(start) {
  const diff = process.hrtime(start);
  return diff[0] + diff[1] / 1e9;
}


/**
 * Consumer 2: Persistence Worker
 * Listens to `expense-structured-events`, saves expense to PostgreSQL,
 * and updates Telegram user.
 */
export async function startPersistenceConsumer() {
  persistenceConsumer = kafka.consumer({ groupId: 'persistence-group' });
  await persistenceConsumer.connect();
  await persistenceConsumer.subscribe({ topic: TOPICS.EXPENSE_STRUCTURED, fromBeginning: false });

  logger.info('[Kafka Consumer] Persistence Worker started.');

  await persistenceConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const start = process.hrtime();
      try {
        const payload = JSON.parse(message.value.toString());
        const { extractedData, rawText, chatId, statusMsgId, timings = {} } = payload;
        const bot = getBot();
        console.log('Extracted data:', extractedData);
        console.log('Raw text:', rawText);
        console.log('Chat ID:', chatId);
        console.log('Status message ID:', statusMsgId);
        console.log('Timings:', timings);
        if (!extractedData || !extractedData.amount) {
          logger.warn(`[Persistence Worker] No amount found for event ${payload.eventId}`);
          if (chatId && statusMsgId && bot) {
            await bot.editMessageText(
              `⚠️ Couldn't detect a transaction amount.\n\n_Extracted Text:_ "${rawText}"`,
              { chat_id: chatId, message_id: statusMsgId, parse_mode: 'Markdown' }
            ).catch(() => { });
          }
          kafkaConsumerDuration.observe({ topic, consumer_group: 'persistence-group', status: 'skipped' }, getDuration(start));
          kafkaMessagesConsumed.inc({ topic, consumer_group: 'persistence-group', status: 'skipped' });
          return;
        }

        // Save to Database with timing
        const rawType = extractedData.transaction_type?.toLowerCase();
        const txType = ['income', 'transfer'].includes(rawType) ? rawType : 'expense';
        const resolvedAccount = await resolveAccountName(extractedData.account);
        const resolvedToAccount = extractedData.to_account ? await resolveAccountName(extractedData.to_account, false) : null;
        const resolvedCategory = await resolveCategoryName(extractedData.category, txType);

        const dbStart = Date.now();
        const savedExpense = await expenseRepo.create({
          original_text: rawText,
          amount: extractedData.amount,
          category: resolvedCategory,
          subcategory: extractedData.subcategory || '',
          transaction_type: txType,
          account: resolvedAccount,
          to_account: resolvedToAccount,
        });
        const dbMs = Date.now() - dbStart;
        timings.dbMs = dbMs;

        // Calculate total pipeline duration from initial ingestion start
        const totalDurationMs = payload.startedAt ? Date.now() - payload.startedAt : null;
        timings.totalDurationMs = totalDurationMs;

        const stageParts = [];
        if (timings.ingestionMs) stageParts.push(`Ingestion: ${(timings.ingestionMs / 1000).toFixed(2)}s`);
        if (timings.whisperMs) stageParts.push(`Whisper: ${(timings.whisperMs / 1000).toFixed(2)}s`);
        if (timings.ocrMs) stageParts.push(`OCR: ${(timings.ocrMs / 1000).toFixed(2)}s`);
        if (timings.llmMs) stageParts.push(`LLM: ${(timings.llmMs / 1000).toFixed(2)}s`);
        if (timings.dbMs) stageParts.push(`DB: ${(timings.dbMs / 1000).toFixed(2)}s`);

        const totalFormatted = totalDurationMs ? `${(totalDurationMs / 1000).toFixed(2)}s` : 'N/A';
        logger.info(`[⏱️ Pipeline Completed] Event #${payload.eventId} | Total: ${totalFormatted} | Breakdown: [${stageParts.join(' | ')}]`);

        logger.info(`[Persistence Worker] Saved Expense ID=${savedExpense.id}`);

        // Notify Telegram with interactive action buttons and timing breakdown
        if (chatId && statusMsgId && bot) {
          await bot.editMessageText(formatExpenseMessage(savedExpense, rawText, timings), {
            chat_id: chatId,
            message_id: statusMsgId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🗑️ Delete', callback_data: `delete_${savedExpense.id}` },
                  { text: '✏️ Correct', callback_data: `edit_${savedExpense.id}` },
                ],
              ],
            },
          }).catch(() => { });
        }

        const diff = process.hrtime(start);
        const durationInSeconds = diff[0] + diff[1] / 1e9;
        kafkaConsumerDuration.observe({ topic, consumer_group: 'persistence-group', status: 'success' }, durationInSeconds);
        kafkaMessagesConsumed.inc({ topic, consumer_group: 'persistence-group', status: 'success' });
      } catch (err) {
        kafkaConsumerDuration.observe({ topic, consumer_group: 'persistence-group', status: 'error' }, getDuration(start));
        kafkaMessagesConsumed.inc({ topic, consumer_group: 'persistence-group', status: 'error' });
        logger.error('[Persistence Worker] Error persisting expense:', err);
      }
    },
  });
}


export async function stopConsumers() {
  if (llmConsumer) await llmConsumer.disconnect();
  if (persistenceConsumer) await persistenceConsumer.disconnect();
}
