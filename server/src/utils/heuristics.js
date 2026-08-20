import fs from 'fs';

const categoriesConfig = JSON.parse(
  fs.readFileSync(new URL('../config/categories.json', import.meta.url), 'utf-8')
);

const accountsConfig = JSON.parse(
  fs.readFileSync(new URL('../config/accounts.json', import.meta.url), 'utf-8')
);

const heuristicsConfig = JSON.parse(
  fs.readFileSync(new URL('../config/heuristics.json', import.meta.url), 'utf-8')
);

// Precompiled Intent Regexes
export const INTENT_PATTERNS = {
  expense: new RegExp(`\\b(${heuristicsConfig.intents.expense.join('|')})\\b`, 'i'),
  transfer: new RegExp(`\\b(${heuristicsConfig.intents.transfer.join('|')})\\b`, 'i'),
  income: new RegExp(`\\b(${heuristicsConfig.intents.income.join('|')})\\b`, 'i'),
};

const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'from', 'all', 'any', 'non']);

// Precompiled Category Keyword Matchers dynamically generated from categories.json
export const CATEGORY_PATTERNS = categoriesConfig.map((cat) => {
  const words = new Set();

  // Add category name tokens
  words.add(cat.name.toLowerCase());
  cat.name
    .split(/[\s,]+/)
    .forEach((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()) && words.add(w.toLowerCase()));

  // Add subcategory tokens
  if (Array.isArray(cat.subcategories)) {
    for (const sub of cat.subcategories) {
      words.add(sub.toLowerCase());
      sub
        .split(/[\s,]+/)
        .forEach((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()) && words.add(w.toLowerCase()));
    }
  }

  // Add extra keywords if configured
  if (Array.isArray(cat.keywords)) {
    for (const kw of cat.keywords) {
      words.add(kw.toLowerCase());
    }
  }

  const escaped = Array.from(words)
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return {
    category: cat.name,
    regex: new RegExp(`\\b(${escaped.join('|')})\\b`, 'i'),
  };
});

// Precompiled Subcategory Matchers dynamically generated from categories.json
export const SUBCATEGORY_PATTERNS = categoriesConfig.reduce((acc, cat) => {
  if (Array.isArray(cat.subcategories) && cat.subcategories.length > 0) {
    acc[cat.name] = cat.subcategories.map((sub) => {
      const words = [sub.toLowerCase(), ...sub.split(/[\s,]+/).filter((w) => w.length > 2)];
      const escaped = Array.from(new Set(words))
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

      return {
        subcategory: sub,
        regex: new RegExp(`\\b(${escaped.join('|')})\\b`, 'i'),
      };
    });
  }
  return acc;
}, {});

// Precompiled Account Alias Matchers dynamically generated from accounts.json
export const ACCOUNT_PATTERNS = accountsConfig.map((acc) => {
  const aliases = new Set([acc.name.toLowerCase()]);
  if (Array.isArray(acc.aliases)) {
    acc.aliases.forEach((a) => aliases.add(a.toLowerCase()));
  }
  const escaped = Array.from(aliases).map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return {
    account: acc.name,
    regex: new RegExp(`\\b(${escaped.join('|')})\\b`, 'i'),
  };
});

export const SILENCE_PATTERNS = new Set(heuristicsConfig.silencePatterns || ['thankyou', 'you']);

// Set of lowercase income category names derived from categories.json
export const INCOME_CATEGORY_NAMES = new Set([
  ...categoriesConfig
    .filter((c) => c.transaction_type === 'income')
    .map((c) => c.name.toLowerCase().trim()),
  'income',
]);

// Default income category name from categories.json
export const DEFAULT_INCOME_CATEGORY =
  categoriesConfig.find((c) => c.transaction_type === 'income')?.name || 'Salary';

/**
 * Check if a category name is an income category defined in categories.json.
 */
export function isIncomeCategory(categoryName) {
  if (!categoryName || typeof categoryName !== 'string') return false;
  return INCOME_CATEGORY_NAMES.has(categoryName.toLowerCase().trim());
}

/**
 * Identify intent (transaction_type) from text.
 */
export function detectIntent(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const isExp = INTENT_PATTERNS.expense.test(lower);
  const isTrf = INTENT_PATTERNS.transfer.test(lower);
  const isInc = INTENT_PATTERNS.income.test(lower);

  if (isExp && !isTrf && !isInc) return 'expense';
  if (isTrf) return 'transfer';
  if (isInc) return 'income';
  return null;
}

/**
 * Match text against known category keywords from categories.json.
 */
export function matchCategoryKeyword(text) {
  if (!text) return null;
  for (const { category, regex } of CATEGORY_PATTERNS) {
    if (regex.test(text)) return category;
  }
  return null;
}

/**
 * Match text against subcategory keywords from categories.json.
 */
export function matchSubcategory(category, text) {
  if (!category || !text) return '';
  const matchers = SUBCATEGORY_PATTERNS[category];
  if (!matchers) return '';

  for (const { subcategory, regex } of matchers) {
    if (regex.test(text)) return subcategory;
  }
  return '';
}

/**
 * Match text against account aliases from accounts.json.
 */
export function matchAccountAlias(text) {
  if (!text) return null;
  for (const { account, regex } of ACCOUNT_PATTERNS) {
    if (regex.test(text)) return account;
  }
  return null;
}
