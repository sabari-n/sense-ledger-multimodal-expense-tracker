import * as expenseRepo from '../repositories/expense.repository.js';
import { resolveAccountName } from '../repositories/account.repository.js';
import { resolveCategoryName } from '../repositories/category.repository.js';
import { transcribeAudio } from './audio.service.js';
import { extractWithLLM } from './llm.service.js';

import { EXPENSE_PROMPT, SILENCE_PATTERNS } from '../utils/constants.js';
import { AppError } from '../errors/AppError.js';
import { VALIDATION_ERROR } from '../errors/errorCodes.js';
import { logger } from '../config/logger.js';

// ─── Audio Pipeline ───────────────────────────────────────────────────────────

/**
 * Full audio-to-expense pipeline: transcribe → LLM extract → persist.
 *
 * @param {string} audioPath Absolute path to the uploaded audio file
 * @returns {Promise<object>} Saved expense plain object
 */
export async function processAudioExpense(audioPath) {
  const whisperStart = Date.now();
  const transcribedText = await transcribeAudio(audioPath);
  logger.info(`Transcript: "${transcribedText}" (took ${((Date.now() - whisperStart) / 1000).toFixed(2)}s)`);

  const cleanText = transcribedText.toLowerCase().replace(/[^a-z]/g, '');
  if (!transcribedText || transcribedText.length < 2 || SILENCE_PATTERNS.has(cleanText)) {
    throw new AppError('No meaningful speech detected in the audio.', VALIDATION_ERROR.status, VALIDATION_ERROR.code);
  }

  logger.info('Extracting expense data via Ollama...');
  const llmStart = Date.now();
  const prompt = await EXPENSE_PROMPT(transcribedText);
  const extracted = await extractWithLLM(transcribedText, prompt);
  logger.info(`Extraction result: ${JSON.stringify(extracted)} (took ${((Date.now() - llmStart) / 1000).toFixed(2)}s)`);

  if (extracted.error || !extracted.amount) {
    throw new AppError(
      extracted.error || 'Could not determine the transaction amount from the audio.',
      VALIDATION_ERROR.status,
      VALIDATION_ERROR.code
    );
  }

  const txType = extracted.transaction_type || 'expense';
  const resolvedAccount = await resolveAccountName(extracted.account);
  const resolvedToAccount = extracted.to_account ? await resolveAccountName(extracted.to_account, false) : null;
  const resolvedCategory = await resolveCategoryName(extracted.category, txType);

  return expenseRepo.create({
    original_text:    transcribedText,
    amount:           extracted.amount,
    category:         resolvedCategory,
    subcategory:      extracted.subcategory || '',
    transaction_type: txType,
    account:          resolvedAccount,
    to_account:       resolvedToAccount,
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getExpenses() {
  return expenseRepo.findAll();
}

export async function createExpense(data) {
  const { amount, category, subcategory, transaction_type, account, to_account, original_text } = data;
  const txType = transaction_type || 'expense';
  const resolvedAccount = await resolveAccountName(account);
  const resolvedToAccount = to_account ? await resolveAccountName(to_account, false) : null;
  const resolvedCategory = await resolveCategoryName(category, txType);

  return expenseRepo.create({
    original_text:    original_text    || 'Manual Entry',
    amount,
    category:         resolvedCategory,
    subcategory:      subcategory      || '',
    transaction_type: txType,
    account:          resolvedAccount,
    to_account:       resolvedToAccount,
  });
}

export async function updateExpense(id, data) {
  const { amount, category, subcategory, transaction_type, account, to_account } = data;
  const updatePayload = {
    amount,
    subcategory,
    transaction_type,
  };

  if (category !== undefined) {
    updatePayload.category = await resolveCategoryName(category, transaction_type);
  }
  if (account !== undefined) {
    updatePayload.account = await resolveAccountName(account);
  }
  if (to_account !== undefined) {
    updatePayload.to_account = to_account ? await resolveAccountName(to_account, false) : null;
  }

  return expenseRepo.update(id, updatePayload);
}

export async function deleteExpense(id) {
  return expenseRepo.destroy(id);
}
