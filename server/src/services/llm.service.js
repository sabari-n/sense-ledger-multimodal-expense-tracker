import { Ollama } from 'ollama';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  llmInferenceDuration,
  llmPromptEvalDuration,
  llmTokensGenerated,
  llmPromptTokens,
  llmTokensPerSecond,
  llmRequestsTotal,
  llmParsingErrorsTotal,
} from '../config/metrics.js';
import {
  detectIntent,
  matchCategoryKeyword,
  matchSubcategory,
  matchAccountAlias,
  isIncomeCategory,
  DEFAULT_INCOME_CATEGORY,
  CATEGORY_PATTERNS,
} from '../utils/heuristics.js';
import {
  TRANSACTION_TYPES,
  DEFAULT_FALLBACK_CATEGORIES,
  GENERIC_CATEGORY_PLACEHOLDERS,
} from '../utils/constants.js';

const ollama = new Ollama({ host: env.ollama.host });

function getDuration(start) {
  const diff = process.hrtime(start);
  return diff[0] + diff[1] / 1e9;
}

// Regex to detect digits, currency symbols, and monetary/number words in speech or text
export const NUMBER_OR_MONETARY_REGEX = /\b(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|lakhs?|lacs?|crores?|millions?|billions?|grand|bucks?|rupees?|rs|inr|dollars?|cents?|euros?|pounds?|k)\b|[₹$€£¥]/i;

/**
 * Extract numerical amount from value or raw speech/text/OCR receipt.
 */
export function extractAmount(val, rawText) {
  let textAmount = null;
  if (rawText) {
    // Handle split speech-to-text numbers like "30,000 100" -> 30100 or "1,000 500" -> 1500
    const splitMatch = rawText.match(/\b(\d{1,3}(?:,\d{3})+)\s+(\d{1,3})\b/);
    if (splitMatch) {
      const base = parseFloat(splitMatch[1].replace(/,/g, ''));
      const extra = parseFloat(splitMatch[2]);
      if (!isNaN(base) && !isNaN(extra)) textAmount = base + extra;
    }
    if (!textAmount) {
      // For receipt/invoice OCR: prioritize "Total:", "Value:", "Grand Total:", "Charges:" amounts
      const receiptMatch = rawText.match(/(?:total|grand\s*total|value|charges)\s*[:=]?\s*([\d,]+(?:\.\d+)?)/im);
      if (receiptMatch) {
        const num = parseFloat(receiptMatch[1].replace(/,/g, ''));
        if (!isNaN(num) && num > 0) textAmount = num;
      }
    }
    if (!textAmount) {
      const match = rawText.match(/(?:amount|rs|inr|rupees|₹|\$)\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/i) ||
        rawText.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:rs|inr|rupees|₹|\$|k\b)/i) ||
        rawText.match(/\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\b/);
      if (match) {
        const num = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(num) && num > 0) textAmount = num;
      }
    }
  }

  // If text contains an explicit amount, always prioritize the text amount over LLM example hallucinations
  if (textAmount) return textAmount;

  // If rawText is provided but contains no numbers or monetary words at all,
  // do NOT trust LLM fallback values (prevents hallucinating amounts from few-shot examples on greetings/chitchat)
  if (rawText && !NUMBER_OR_MONETARY_REGEX.test(rawText)) {
    return null;
  }

  if (val !== undefined && val !== null && val !== '') {
    const cleaned = typeof val === 'string' ? val.replace(/,/g, '').trim() : val;
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 0) return num;
  }

  return null;
}

/**
 * Normalise and unwrap any nested structures (like fields: [...], arrays, or wrapped objects)
 * that smaller LLMs might occasionally produce.
 */
export function normalizeExtracted(parsed, rawText = '') {
  if (!parsed || typeof parsed !== 'object') return {};

  if (Array.isArray(parsed)) {
    return normalizeExtracted(parsed[0], rawText);
  }

  // Handle {"fields": [ {...} ]} or {"transactions": [ {...} ]}
  if (Array.isArray(parsed.fields) && parsed.fields.length > 0) {
    const item = parsed.fields[0];
    return {
      ...item,
      transaction_type: item.transaction_type || parsed.transactionType || parsed.transaction_type || TRANSACTION_TYPES.EXPENSE,
      to_account: item.to_account || parsed.to_account || parsed.toAccount || null,
    };
  }

  if (Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
    return normalizeExtracted(parsed.transactions[0], rawText);
  }

  if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
    return normalizeExtracted(parsed.data, rawText);
  }

  // If LLM returned a JSON Schema definition object instead of transaction values:
  if (parsed.$schema || (parsed.properties && !parsed.amount)) {
    logger.warn('[Ollama] LLM returned schema definition instead of values. Falling back to heuristic text extraction.');
    const amount = extractAmount(null, rawText);
    const account = matchAccountAlias(rawText) || env.defaults?.account;
    const detectedIntent = detectIntent(rawText);
    const isIncome = detectedIntent === TRANSACTION_TYPES.INCOME;
    const isTransfer = detectedIntent === TRANSACTION_TYPES.TRANSFER;

    const matchedCategory = matchCategoryKeyword(rawText);
    const fallbackCategory = isIncome
      ? (env.defaults?.incomeCategory || DEFAULT_INCOME_CATEGORY)
      : (isTransfer ? DEFAULT_FALLBACK_CATEGORIES.TRANSFER : (matchedCategory || DEFAULT_FALLBACK_CATEGORIES.EXPENSE));
    const matchedSubcategory = matchedCategory ? matchSubcategory(matchedCategory, rawText) : '';

    return {
      amount,
      category: fallbackCategory,
      subcategory: matchedSubcategory,
      account,
      to_account: null,
      transaction_type: isIncome ? TRANSACTION_TYPES.INCOME : (isTransfer ? TRANSACTION_TYPES.TRANSFER : TRANSACTION_TYPES.EXPENSE),
      ...(amount === null ? { error: 'No transaction detected' } : {}),
    };
  }

  // Sanitize and ensure valid numerical amount
  parsed.amount = extractAmount(parsed.amount, rawText);

  // If no amount could be determined and raw text has no numeric/monetary words, mark as non-transaction error
  if (!parsed.amount && !parsed.error && rawText && !NUMBER_OR_MONETARY_REGEX.test(rawText)) {
    parsed.error = 'No transaction detected';
  }

  // Ensure transaction_type matches explicit user intent in text
  const detectedIntent = detectIntent(rawText);
  const parsedCatLower = parsed.category?.toLowerCase()?.trim();

  if (detectedIntent === TRANSACTION_TYPES.EXPENSE) {
    parsed.transaction_type = TRANSACTION_TYPES.EXPENSE;
  } else if (detectedIntent === TRANSACTION_TYPES.TRANSFER || (parsed.to_account && parsed.to_account !== parsed.account)) {
    parsed.transaction_type = TRANSACTION_TYPES.TRANSFER;
  } else if (detectedIntent === TRANSACTION_TYPES.INCOME || isIncomeCategory(parsedCatLower)) {
    parsed.transaction_type = TRANSACTION_TYPES.INCOME;
    if (!parsed.category || GENERIC_CATEGORY_PLACEHOLDERS.includes(parsedCatLower)) {
      parsed.category = env.defaults?.incomeCategory || DEFAULT_INCOME_CATEGORY;
    }
  } else if (!parsed.transaction_type) {
    parsed.transaction_type = TRANSACTION_TYPES.EXPENSE;
  }

  if (parsed.transaction_type === TRANSACTION_TYPES.TRANSFER) {
    parsed.category = null;
    parsed.subcategory = null;
  } else {
    // Refine Category & Subcategory based on explicit keywords in speech/text
    const keywordCategory = matchCategoryKeyword(rawText);
    if (keywordCategory) {
      if (!parsed.category || GENERIC_CATEGORY_PLACEHOLDERS.includes(parsed.category.toLowerCase()) || parsed.category.toLowerCase() !== keywordCategory.toLowerCase()) {
        const llmCatPattern = CATEGORY_PATTERNS.find(p => p.category.toLowerCase() === parsed.category?.toLowerCase());
        if (!llmCatPattern || !llmCatPattern.regex.test(rawText)) {
          parsed.category = keywordCategory;
        }
      }
    } else {
      // If no specific category keyword exists in text, ensure hallucinated categories fall back to "Other"
      const llmCatPattern = CATEGORY_PATTERNS.find(p => p.category.toLowerCase() === parsed.category?.toLowerCase());
      if (llmCatPattern && !llmCatPattern.regex.test(rawText)) {
        parsed.category = DEFAULT_FALLBACK_CATEGORIES.EXPENSE;
      }
    }

    if (parsed.category) {
      const refinedSub = matchSubcategory(parsed.category, rawText);
      parsed.subcategory = refinedSub || '';
    }
  }

  return parsed;
}

/**
 * Extract structured financial entity data from text using Ollama LLM.
 * Used across Voice, OCR Receipt, and Telegram text pipelines.
 *
 * @param {string} text    Original transcript or OCR raw text
 * @param {string} prompt  Full structured extraction prompt passed to the LLM
 * @returns {Promise<object>} Parsed JSON object with normalized transaction fields
 */
export async function extractWithLLM(text, prompt) {
  const model = env.ollama.model || 'unknown';
  logger.debug(`Sending to Ollama model=${model}`);
  const start = process.hrtime();

  try {
    const response = await ollama.chat({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a financial entity extraction assistant. Always output a single flat JSON object with the extracted transaction fields: amount (number or null), category (string), subcategory (string), account (string), to_account (string or null), transaction_type ("expense"|"income"|"transfer"). If the input is a greeting or does not contain a financial transaction, return {"amount": null, "error": "No transaction detected"}. Never output a JSON schema, schema definition, or definitions object.',
        },
        { role: 'user', content: prompt },
      ],
      format: 'json',
    });

    const durationSec = getDuration(start);
    llmInferenceDuration.observe({ model, status: 'success' }, durationSec);
    llmRequestsTotal.inc({ model, status: 'success' });

    // Track token counts & speed if returned by Ollama
    if (response.eval_count) {
      llmTokensGenerated.inc({ model }, response.eval_count);
    }
    if (response.prompt_eval_count) {
      llmPromptTokens.inc({ model }, response.prompt_eval_count);
    }
    if (response.prompt_eval_duration) {
      llmPromptEvalDuration.observe({ model }, response.prompt_eval_duration / 1e9);
    }
    if (response.eval_count && response.eval_duration) {
      const evalSec = response.eval_duration / 1e9;
      if (evalSec > 0) {
        llmTokensPerSecond.observe({ model }, response.eval_count / evalSec);
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(response.message.content);
    } catch (parseErr) {
      llmParsingErrorsTotal.inc({ model, error_type: 'json_parse_error' });
      throw parseErr;
    }

    return normalizeExtracted(parsed, text);
  } catch (err) {
    const durationSec = getDuration(start);
    llmInferenceDuration.observe({ model, status: 'error' }, durationSec);
    llmRequestsTotal.inc({ model, status: 'error' });
    throw err;
  }
}
