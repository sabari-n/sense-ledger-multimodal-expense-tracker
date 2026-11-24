import * as expenseRepo from '../repositories/expense.repository.js';
import { resolveAccountName } from '../repositories/account.repository.js';
import { resolveCategoryName } from '../repositories/category.repository.js';
import { transcribeAudio } from './audio.service.js';
import { extractWithLLM } from './llm.service.js';

import { EXPENSE_PROMPT, SILENCE_PATTERNS } from '../utils/constants.js';
import { AppError } from '../errors/AppError.js';
import { VALIDATION_ERROR, NOT_FOUND } from '../errors/errorCodes.js';
import { logger } from '../config/logger.js';
import { TRANSACTION_SOURCES } from '../utils/enums.js';

// A transfer without a distinct destination would debit one account and credit none.
function assertValidTransfer(txType, account, toAccount) {
  if (txType === 'transfer' && (!toAccount || toAccount === account)) {
    throw new AppError(
      'A transfer needs a known to_account different from the source account.',
      VALIDATION_ERROR.status,
      VALIDATION_ERROR.code
    );
  }
}

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
  assertValidTransfer(txType, resolvedAccount, resolvedToAccount);

  return expenseRepo.create({
    original_text:    transcribedText,
    amount:           extracted.amount,
    category:         resolvedCategory,
    subcategory:      extracted.subcategory || '',
    transaction_type: txType,
    account:          resolvedAccount,
    to_account:       resolvedToAccount,
    source:           TRANSACTION_SOURCES.VOICE,
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getExpenses() {
  return expenseRepo.findAll();
}

export async function createExpense(data) {
  const { amount, category, subcategory, transaction_type, account, to_account, original_text, date } = data;
  const txType = transaction_type || 'expense';
  const resolvedAccount = await resolveAccountName(account);
  const resolvedToAccount = to_account ? await resolveAccountName(to_account, false) : null;
  const resolvedCategory = await resolveCategoryName(category, txType);
  assertValidTransfer(txType, resolvedAccount, resolvedToAccount);

  return expenseRepo.create({
    original_text:    original_text    || 'Manual Entry',
    amount,
    category:         resolvedCategory,
    subcategory:      subcategory      || '',
    transaction_type: txType,
    account:          resolvedAccount,
    to_account:       resolvedToAccount,
    source:           TRANSACTION_SOURCES.MANUAL,
    ...(date ? { date: new Date(date) } : {}), // omitted -> the model's default, now
  });
}

export async function updateExpense(id, data) {
  const existing = await expenseRepo.findById(id);
  if (!existing) {
    throw new AppError(`Transaction ${id} not found.`, NOT_FOUND.status, NOT_FOUND.code);
  }
  const { amount, category, subcategory, transaction_type, account, to_account, original_text, date } = data;
  const txType = transaction_type || existing.transaction_type;
  const updatePayload = {
    amount,
    subcategory,
    transaction_type,
    original_text,
    date: date ? new Date(date) : undefined,
  };

  if (category !== undefined || transaction_type !== undefined) {
    updatePayload.category = await resolveCategoryName(category ?? existing.category, txType);
  }
  if (account !== undefined) {
    updatePayload.account = await resolveAccountName(account);
  }
  if (txType !== 'transfer') {
    updatePayload.to_account = null; // only transfers have a destination
  } else if (to_account !== undefined) {
    updatePayload.to_account = to_account ? await resolveAccountName(to_account, false) : null;
  }

  if (txType === 'transfer') {
    assertValidTransfer(
      txType,
      updatePayload.account ?? existing.account,
      updatePayload.to_account !== undefined ? updatePayload.to_account : existing.to_account
    );
  }

  // Drop fields the caller didn't send so they keep their current values.
  Object.keys(updatePayload).forEach((k) => updatePayload[k] === undefined && delete updatePayload[k]);
  return expenseRepo.update(id, updatePayload);
}

export async function deleteExpense(id) {
  return expenseRepo.destroy(id);
}
