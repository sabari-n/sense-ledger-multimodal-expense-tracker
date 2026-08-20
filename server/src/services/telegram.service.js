import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { publishEvent } from './kafka.producer.js';
import { TOPICS } from '../config/kafka.js';
import { saveRawMessage } from '../repositories/telegram.repository.js';
import * as expenseRepo from '../repositories/expense.repository.js';
import { resolveAccountName } from '../repositories/account.repository.js';
import { resolveCategoryName } from '../repositories/category.repository.js';
import { extractWithLLM } from './llm.service.js';
import { logger } from '../config/logger.js';

import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let bot = null;

// Track pending corrections: chatId -> expenseId
const pendingCorrections = new Map();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(destPath, () => { });
      reject(err);
    });
  });
}

function generateEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// ─────────────────────────────────────────────
// Audio Pipeline Producer (voice note / uploaded file)
// ─────────────────────────────────────────────

async function processAudioFile({ chatId, fileId, ext = 'ogg', messageType = 'voice' }) {
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const startTime = Date.now();
  const statusMsg = await bot.sendMessage(chatId, '🎙️ Received audio! Queueing for processing…');

  try {
    const fileInfo = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.telegram.botToken}/${fileInfo.file_path}`;
    const audioPath = path.join(uploadsDir, `tg-${messageType}-${Date.now()}.${ext}`);

    logger.info(`[Telegram] Downloading ${messageType}: ${audioPath}`);
    await downloadFile(fileUrl, audioPath);

    const eventId = generateEventId();
    const ingestionMs = Date.now() - startTime;

    // Publish to Kafka Audio Ingestion topic
    await publishEvent(TOPICS.AUDIO_INGESTION, {
      eventId,
      source: 'telegram',
      messageType,
      filePath: audioPath,
      chatId,
      statusMsgId: statusMsg.message_id,
      startedAt: startTime,
      timings: {
        ingestionMs,
      },
    });

    await bot.editMessageText(
      `📥 *Queued for processing!*\n\n_Event ID:_ \`${eventId}\`\nProcessing asynchronously via Kafka...`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
    );

  } catch (err) {
    logger.error(`[Telegram] ${messageType} queuing error:`, err);
    await bot.editMessageText('❌ Something went wrong while queueing audio. Please try again.', {
      chat_id: chatId, message_id: statusMsg.message_id,
    });
  }
}

// ─────────────────────────────────────────────
// Photo Pipeline Producer (receipt / bill image)
// ─────────────────────────────────────────────

async function processPhotoFile({ chatId, fileId }) {
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const startTime = Date.now();
  const statusMsg = await bot.sendMessage(chatId, '🖼️ Received photo! Queueing for processing…');

  try {
    const fileInfo = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.telegram.botToken}/${fileInfo.file_path}`;
    const ext = path.extname(fileInfo.file_path) || '.jpg';
    const imagePath = path.join(uploadsDir, `tg-photo-${Date.now()}${ext}`);

    logger.info(`[Telegram] Downloading photo: ${imagePath}`);
    await downloadFile(fileUrl, imagePath);

    const eventId = generateEventId();
    const ingestionMs = Date.now() - startTime;

    // Publish to Kafka Image Ingestion topic
    await publishEvent(TOPICS.IMAGE_INGESTION, {
      eventId,
      source: 'telegram',
      messageType: 'photo',
      filePath: imagePath,
      chatId,
      statusMsgId: statusMsg.message_id,
    });

    await bot.editMessageText(
      `📥 *Queued for processing!*\n\n_Event ID:_ \`${eventId}\`\nProcessing receipt asynchronously via Kafka...`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
    );

  } catch (err) {
    logger.error('[Telegram] Photo queuing error:', err);
    await bot.editMessageText('❌ Something went wrong while queueing image. Please try again.', {
      chat_id: chatId, message_id: statusMsg.message_id,
    });
  }
}

// ─────────────────────────────────────────────
// Pending Correction Processor
// ─────────────────────────────────────────────

async function handleExpenseCorrection(chatId, correctionText) {
  const expenseId = pendingCorrections.get(chatId);
  pendingCorrections.delete(chatId);

  const statusMsg = await bot.sendMessage(chatId, `🔄 Updating transaction #${expenseId}…`);

  try {
    const currentExpense = await expenseRepo.findById(expenseId);
    if (!currentExpense) {
      await bot.editMessageText('⚠️ Transaction not found or already deleted.', {
        chat_id: chatId, message_id: statusMsg.message_id,
      });
      return;
    }

    const prompt =
      `Existing expense transaction: ${JSON.stringify(currentExpense)}\n\n` +
      `User requested correction: "${correctionText}"\n\n` +
      `Update the fields accordingly. Extract JSON schema:\n` +
      `{"amount": number, "category": string, "subcategory": string, "transaction_type": "expense"|"income", "account": string}`;

    console.log('prompt', prompt)
    const updatedData = await extractWithLLM(correctionText, prompt);
    console.log('updatedData', updatedData)

    const resolvedAccount = updatedData.account
      ? await resolveAccountName(updatedData.account)
      : currentExpense.account;

    const txType = updatedData.transaction_type || currentExpense.transaction_type;
    const resolvedCategory = updatedData.category
      ? await resolveCategoryName(updatedData.category, txType)
      : currentExpense.category;

    const updatedExpense = await expenseRepo.update(expenseId, {
      amount: updatedData.amount || currentExpense.amount,
      category: resolvedCategory,
      subcategory: updatedData.subcategory || currentExpense.subcategory,
      transaction_type: txType,
      account: resolvedAccount,
    });

    const emoji = updatedExpense.transaction_type === 'income' ? '💰' : '💸';
    const sign = updatedExpense.transaction_type === 'income' ? '+' : '-';
    const currencySymbol = env.defaults.currencySymbol || '₹';

    await bot.editMessageText(
      `✅ *Transaction #${expenseId} Updated!*\n\n` +
      `*Amount:* ${sign}${currencySymbol}${updatedExpense.amount}\n` +
      `*Category:* ${updatedExpense.category}${updatedExpense.subcategory ? ` › ${updatedExpense.subcategory}` : ''}\n` +
      `*Account:* ${updatedExpense.account}\n` +
      `*Type:* ${updatedExpense.transaction_type}`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🗑️ Delete', callback_data: `delete_${expenseId}` },
              { text: '✏️ Correct', callback_data: `edit_${expenseId}` },
            ],
          ],
        },
      }
    );

  } catch (err) {
    logger.error(`[Telegram] Correction error for ID=${expenseId}:`, err);
    await bot.editMessageText('❌ Failed to update transaction. Please try again.', {
      chat_id: chatId, message_id: statusMsg.message_id,
    });
  }
}

// ─────────────────────────────────────────────
// Telegram Event Handlers
// ─────────────────────────────────────────────

async function handleVoiceMessage(msg) {
  const chatId = msg.chat.id;
  if (pendingCorrections.has(chatId)) {
    // If pending correction, process audio transcription as correction text
    // For now publish to audio queue
  }

  await processAudioFile({
    chatId: msg.chat.id,
    fileId: msg.voice.file_id,
    ext: 'ogg',
    messageType: 'voice',
  });
}

async function handleAudioMessage(msg) {
  const audio = msg.audio;
  let ext = 'mp3';
  if (audio.mime_type) {
    const mime = audio.mime_type.split('/');
    ext = mime[1] === 'mpeg' ? 'mp3' : (mime[1] || 'mp3');
  } else if (audio.file_name) {
    ext = path.extname(audio.file_name).replace('.', '') || 'mp3';
  }

  await processAudioFile({
    chatId: msg.chat.id,
    fileId: audio.file_id,
    ext,
    messageType: 'audio',
  });
}

async function handlePhotoMessage(msg) {
  const photos = msg.photo;
  const bestPhoto = photos[photos.length - 1];

  await processPhotoFile({
    chatId: msg.chat.id,
    fileId: bestPhoto.file_id,
  });
}

async function handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text.startsWith('/')) return;

  // Check if this text message is a correction for a pending expense
  if (pendingCorrections.has(chatId)) {
    await handleExpenseCorrection(chatId, text);
    return;
  }

  try {
    const startTime = Date.now();
    const eventId = generateEventId();
    await saveRawMessage(chatId, 'text', text);

    const statusMsg = await bot.sendMessage(
      chatId,
      `📥 *Queued for processing!*\n\n_"${text}"_\n\nProcessing text transaction via Kafka...`,
      { parse_mode: 'Markdown' }
    );

    // Directly publish raw text event to text-extracted-events topic
    await publishEvent(TOPICS.TEXT_EXTRACTED, {
      eventId,
      source: 'telegram',
      messageType: 'text',
      rawText: text,
      chatId,
      statusMsgId: statusMsg.message_id,
      startedAt: startTime,
      timings: {
        ingestionMs: Date.now() - startTime,
      },
    });
  } catch (err) {
    logger.error('[Telegram] Text handler error:', err);
    await bot.sendMessage(chatId, 'Something went wrong. Please try again.');
  }
}

async function handleStart(msg) {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'there';
  await bot.sendMessage(
    chatId,
    `👋 Hi *${firstName}*! I'm your *Voice & Image Expense Tracker* bot.\n\n` +
    `Send me a voice note, audio file, or receipt photo and I'll queue it for asynchronous processing via Kafka.`,
    { parse_mode: 'Markdown' }
  );
}

// ─────────────────────────────────────────────
// Callback Query Handler (Inline Keyboard Buttons)
// ─────────────────────────────────────────────

async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  try {
    if (data.startsWith('delete_')) {
      const expenseId = data.replace('delete_', '');
      logger.info(`[Telegram Callback] Deleting expense ID=${expenseId}`);

      await expenseRepo.destroy(expenseId);
      await bot.answerCallbackQuery(query.id, { text: 'Transaction deleted' });

      await bot.editMessageText(`🗑️ *Transaction #${expenseId} deleted.*`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
      });

    } else if (data.startsWith('edit_')) {
      const expenseId = data.replace('edit_', '');
      logger.info(`[Telegram Callback] Initiating correction for expense ID=${expenseId}`);

      pendingCorrections.set(chatId, expenseId);
      await bot.answerCallbackQuery(query.id, { text: 'Send your correction now' });

      await bot.sendMessage(
        chatId,
        `✏️ *Send your correction for Transaction #${expenseId}*\n\n` +
        `Reply with text or voice note like:\n` +
        `• _"Amount is 500"_\n` +
        `• _"Category should be Food"_\n` +
        `• _"Paid via HDFC Bank"_\n`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    logger.error('[Telegram Callback] Error handling callback query:', err);
    await bot.answerCallbackQuery(query.id, { text: 'Action failed. Please try again.' }).catch(() => { });
  }
}

// ─────────────────────────────────────────────
// Bot Initialisation / Teardown
// ─────────────────────────────────────────────

export function initTelegramBot(token) {
  if (bot) {
    logger.warn('Telegram bot is already running.');
    return bot;
  }

  bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start/, handleStart);
  bot.onText(/\/help/, handleStart);

  bot.on('voice', handleVoiceMessage);
  bot.on('audio', handleAudioMessage);
  bot.on('photo', handlePhotoMessage);

  bot.on('message', (msg) => {
    if (msg.text && !msg.text.startsWith('/')) handleTextMessage(msg);
  });

  bot.on('callback_query', handleCallbackQuery);

  bot.on('polling_error', (err) => {
    logger.error('[Telegram] Polling error:', err.message);
  });

  logger.info('Telegram bot is running and polling for messages.');
  return bot;
}

export function stopTelegramBot() {
  if (bot) {
    bot.stopPolling();
    bot = null;
    logger.info('Telegram bot stopped.');
  }
}

export function getBot() {
  return bot;
}
