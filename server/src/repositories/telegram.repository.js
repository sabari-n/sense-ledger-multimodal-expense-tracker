import TelegramRawMessage from '../models/telegram-raw-message.model.js';

/**
 * Persist a raw incoming Telegram message for later queue processing.
 *
 * @param {number|string} chatId
 * @param {string} messageType  e.g. 'text' | 'voice' | 'audio'
 * @param {string} rawText      Transcribed or original text content
 * @returns {Promise<number>}   The new record's id
 */
export async function saveRawMessage(chatId, messageType, rawText) {
  const record = await TelegramRawMessage.create({ chat_id: chatId, message_type: messageType, raw_text: rawText });
  return record.id;
}
