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
  accountsFromText,
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

export const TRANSFER_NEEDS_TWO_ACCOUNTS =
  'A transfer needs two different accounts, e.g. "transfer 1000 from Union Bank to ICICI".';

const sameAccount = (a, b) =>
  (matchAccountAlias(a) || a || '').toLowerCase() === (matchAccountAlias(b) || b || '').toLowerCase();

/**
 * Final checks shared by every extraction path. Small models copy the system
 * prompt's {"error": "No transaction detected"} even when they found an amount,
 * so an error is only kept when there is no amount or the transfer is incomplete.
 */
function finalizeExtraction(parsed) {
  if (parsed.amount) delete parsed.error;
  if (
    parsed.amount &&
    parsed.transaction_type === TRANSACTION_TYPES.TRANSFER &&
    (!parsed.to_account || sameAccount(parsed.account, parsed.to_account))
  ) {
    parsed.error = TRANSFER_NEEDS_TWO_ACCOUNTS;
  }
  return parsed;
}

// Regex to detect digits, currency symbols, and monetary/number words in speech or text
export const NUMBER_OR_MONETARY_REGEX = /\b(?:\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|lakhs?|lacs?|crores?|millions?|billions?|grand|bucks?|rupees?|rs|inr|dollars?|cents?|euros?|pounds?|k)\b|[₹$€£¥]/i;

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALE_WORDS = {
  hundred: 100, thousand: 1e3, k: 1e3, grand: 1e3,
  lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, million: 1e6, crore: 1e7, crores: 1e7,
};
const CURRENCY_WORDS = new Set(['rupee', 'rupees', 'rs', 'inr', 'bucks', 'buck', '₹']);

/**
 * Find numbers spoken as words or digits+scale ("two thousand", "2 thousand",
 * "1.5 lakh", "5k", "twenty five rupees"). Whisper often writes amounts this way.
 * Returns each run with whether it has a digit, a scale word, or a currency word next to it.
 */
export function parseSpokenAmounts(text) {
  if (!text) return [];
  const tokens = text.toLowerCase().replace(/₹/g, ' ₹ ').replace(/,/g, '').split(/[\s\-]+/)
    .map((t) => t.replace(/[^a-z0-9.₹]/g, '').replace(/\.$/, ''))
    .filter(Boolean);

  const runs = [];
  let run = null;
  const close = (i) => {
    if (run && run.used) {
      const next = tokens[i];
      const prev = tokens[run.start - 1];
      runs.push({
        value: run.total + run.current,
        hasDigit: run.hasDigit,
        hasScale: run.hasScale,
        nearCurrency: CURRENCY_WORDS.has(next) || CURRENCY_WORDS.has(prev),
      });
    }
    run = null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const kMatch = tok.match(/^(\d+(?:\.\d+)?)k$/);
    const isDigit = /^\d+(?:\.\d+)?$/.test(tok);
    // "a"/"an" counts as 1 only directly before a scale word ("a thousand")
    const isArticle = (tok === 'a' || tok === 'an') && SCALE_WORDS[tokens[i + 1]] && tokens[i + 1] !== 'k';
    const isPart = isDigit || kMatch || tok in NUMBER_WORDS || tok in SCALE_WORDS || isArticle || (tok === 'and' && run?.used);

    if (!isPart) { close(i); continue; }
    const newRun = () => ({ start: i, total: 0, current: 0, used: false, hasDigit: false, hasScale: false, last: null });
    if (!run) run = newRun();

    if (tok === 'and') { run.last = 'and'; continue; }

    if (kMatch) {
      if (run.used) { close(i); run = newRun(); }
      run.total += parseFloat(kMatch[1]) * 1e3; run.used = run.hasDigit = run.hasScale = true; run.last = 'scale';
    } else if (isDigit || tok in NUMBER_WORDS || isArticle) {
      const value = isDigit ? parseFloat(tok) : (isArticle ? 1 : NUMBER_WORDS[tok]);
      // A value continues the number only after a scale word or "and" ("two thousand five",
      // "hundred and fifty") or as the unit after a tens word ("twenty five").
      // Otherwise ("500 200", "two three") it starts a new number.
      const continues = !run.used || run.last === 'scale' || run.last === 'and' ||
        (run.last === 'tens' && !isDigit && value < 10);
      if (!continues) { close(i); run = newRun(); }
      run.current += value;
      run.used = true; run.hasDigit ||= isDigit;
      run.last = isDigit ? 'digit' : (value >= 20 && value % 10 === 0 ? 'tens' : 'unit');
    } else if (tok in SCALE_WORDS) {
      if (!run.used && tok === 'k') { close(i); continue; }
      const scale = SCALE_WORDS[tok];
      if (scale === 100) run.current = (run.current || 1) * 100;
      else { run.total += (run.current || 1) * scale; run.current = 0; }
      run.used = run.hasScale = true; run.last = 'scale';
    }
  }
  close(tokens.length);
  return runs.filter((r) => r.value > 0);
}

/**
 * Extract numerical amount from value or raw speech/text/OCR receipt.
 */
export function extractAmount(val, rawText) {
  let textAmount = null;
  const spoken = parseSpokenAmounts(rawText);
  const hasBareDigits = rawText ? /\d/.test(rawText) : false;
  if (rawText) {
    // Handle split speech-to-text numbers like "30,000 100" -> 30100 or "1,000 500" -> 1500
    const splitMatch = rawText.match(/\b(\d{1,3}(?:,\d{3})+)\s+(\d{1,3})\b/);
    if (splitMatch) {
      const base = parseFloat(splitMatch[1].replace(/,/g, ''));
      const extra = parseFloat(splitMatch[2]);
      if (!isNaN(base) && !isNaN(extra)) textAmount = base + extra;
    }
    if (!textAmount) {
      // For receipt/invoice OCR, in priority order:
      //  1. the final payable line ("Bill Total", "Grand Total", "To Pay", "Amount Paid", ...)
      //  2. the last plain "Total" that isn't an "Item Total" / "Sub Total" (those come before discounts and fees)
      //  3. "Value:" / "Charges:"
      const num = (s) => parseFloat(s.replace(/,/g, ''));
      const AMT = String.raw`\s*[:=]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)`;
      const finalTotal = rawText.match(new RegExp(
        String.raw`(?:bill\s*total|grand\s*total|net\s*(?:total|payable|amount)|total\s*(?:payable|paid|due|amount)|amount\s*(?:paid|payable|due)|to\s*pay)` + AMT, 'i'));
      const plainTotals = [...rawText.matchAll(new RegExp(String.raw`(?<!(?:item|sub)[\s-]?)\btotal` + AMT, 'gi'))];
      const other = rawText.match(new RegExp(String.raw`(?:value|charges)` + AMT, 'i'));
      const receiptAmount = finalTotal ? num(finalTotal[1])
        : plainTotals.length ? num(plainTotals[plainTotals.length - 1][1])
        : other ? num(other[1]) : null;
      if (receiptAmount && !isNaN(receiptAmount) && receiptAmount > 0) textAmount = receiptAmount;
    }
    // Spoken/scaled number right next to a currency word: "two thousand rupees", "2 thousand rs"
    if (!textAmount) {
      const withCurrency = spoken.find((r) => r.nearCurrency && (r.hasScale || !r.hasDigit));
      if (withCurrency) textAmount = withCurrency.value;
    }
    if (!textAmount) {
      const match = rawText.match(/(?:amount|rs|inr|rupees|₹|\$)\s*[:=]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(?!\s*(?:k\b|hundred|thousand|lakhs?|lacs?|crores?|million))/i) ||
        rawText.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:rs|inr|rupees|₹|\$)/i);
      if (match) {
        const num = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(num) && num > 0) textAmount = num;
      }
    }
    // Scaled number without a currency word: "spent two thousand", "5k", "1.5 lakh".
    // A words-only run is skipped when the text also has plain digits ("300 for two hundred grams").
    if (!textAmount) {
      const scaled = spoken.find((r) => r.hasScale && (r.hasDigit || !hasBareDigits));
      if (scaled) textAmount = scaled.value;
    }
    if (!textAmount) {
      const match = rawText.match(/\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\b/);
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
    const detectedIntent = detectIntent(rawText);
    const isIncome = detectedIntent === TRANSACTION_TYPES.INCOME;
    const isTransfer = detectedIntent === TRANSACTION_TYPES.TRANSFER;
    const textAccounts = accountsFromText(rawText, isTransfer);

    const matchedCategory = matchCategoryKeyword(rawText);
    const fallbackCategory = isIncome
      ? (env.defaults?.incomeCategory || DEFAULT_INCOME_CATEGORY)
      : (isTransfer ? DEFAULT_FALLBACK_CATEGORIES.TRANSFER : (matchedCategory || DEFAULT_FALLBACK_CATEGORIES.EXPENSE));
    const matchedSubcategory = matchedCategory ? matchSubcategory(matchedCategory, rawText) : '';

    return finalizeExtraction({
      amount,
      category: fallbackCategory,
      subcategory: matchedSubcategory,
      account: textAccounts.account || env.defaults?.account,
      to_account: textAccounts.to_account || null,
      transaction_type: isIncome ? TRANSACTION_TYPES.INCOME : (isTransfer ? TRANSACTION_TYPES.TRANSFER : TRANSACTION_TYPES.EXPENSE),
      ...(amount === null ? { error: 'No transaction detected' } : {}),
    });
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

  // Accounts named in the text beat the LLM's guess; small models tend to
  // default to the first account in the prompt's examples.
  const isTransfer = parsed.transaction_type === TRANSACTION_TYPES.TRANSFER;
  Object.assign(parsed, accountsFromText(rawText, isTransfer));
  if (!isTransfer) parsed.to_account = null;

  if (isTransfer) {
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

  return finalizeExtraction(parsed);
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
