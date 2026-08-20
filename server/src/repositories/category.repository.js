import { fn, col, where as seqWhere } from 'sequelize';
import Category from '../models/category.model.js';
import { env } from '../config/env.js';
import { matchCategoryKeyword, DEFAULT_INCOME_CATEGORY } from '../utils/heuristics.js';
import {
  TRANSACTION_TYPES,
  DEFAULT_FALLBACK_CATEGORIES,
} from '../utils/constants.js';

// ─── In-Memory Cache ─────────────────────────────────────────────────────────
const idToCategoryMap = new Map();
const nameToCategoryMap = new Map();
let isCategoryCacheLoaded = false;

/**
 * Populate or refresh in-memory category cache.
 */
export async function loadCategoryCache() {
  const categories = await Category.findAll({
    order: [['sort_order', 'ASC'], ['created_at', 'ASC']],
    raw: true,
  });

  idToCategoryMap.clear();
  nameToCategoryMap.clear();

  for (const cat of categories) {
    idToCategoryMap.set(cat.id, cat);
    nameToCategoryMap.set(cat.name.toLowerCase().trim(), cat);
  }

  isCategoryCacheLoaded = true;
  return categories;
}

async function ensureCategoryCache() {
  if (!isCategoryCacheLoaded || idToCategoryMap.size === 0) {
    await loadCategoryCache();
  }
}

export async function findAll(where = {}) {
  await ensureCategoryCache();
  const all = Array.from(idToCategoryMap.values());
  if (where.transaction_type) {
    return all.filter(c => c.transaction_type === where.transaction_type);
  }
  return all;
}

export async function findById(id) {
  await ensureCategoryCache();
  return idToCategoryMap.get(Number(id)) || null;
}

export async function create(data) {
  const instance = await Category.create(data);
  const plain = instance.get({ plain: true });
  await loadCategoryCache();
  return plain;
}

export async function update(id, data) {
  await Category.update(data, { where: { id } });
  const fresh = await Category.findByPk(id, { raw: true });
  await loadCategoryCache();
  return fresh;
}

export async function destroyById(id) {
  const result = await Category.destroy({ where: { id: Number(id) } });
  await loadCategoryCache();
  return result;
}

export async function count() {
  await ensureCategoryCache();
  return idToCategoryMap.size;
}

/**
 * Ensure a category exists in PostgreSQL before inserting/updating an expense
 * to guarantee that foreign key constraints are never violated.
 *
 * @param {string} categoryName The category name from LLM or user
 * @param {string} transactionType 'expense' | 'income' | 'transfer'
 * @returns {Promise<string>} Valid existing category name
 */
export async function resolveCategoryName(categoryName, transactionType = TRANSACTION_TYPES.EXPENSE) {
  await ensureCategoryCache();

  const isIncome = transactionType === TRANSACTION_TYPES.INCOME;
  const isTransfer = transactionType === TRANSACTION_TYPES.TRANSFER;
  const defaultFallback = isIncome
    ? (env.defaults?.incomeCategory || DEFAULT_FALLBACK_CATEGORIES.INCOME)
    : (isTransfer ? DEFAULT_FALLBACK_CATEGORIES.TRANSFER : (env.defaults?.expenseCategory || DEFAULT_FALLBACK_CATEGORIES.EXPENSE));

  if (!categoryName || typeof categoryName !== 'string' || !categoryName.trim()) {
    const fallbackCat = nameToCategoryMap.get(defaultFallback.toLowerCase());
    return fallbackCat?.name || defaultFallback;
  }

  const trimmed = categoryName.trim();
  const lower = trimmed.toLowerCase();

  // Handle generic "Income" or "Expense" extraction
  if (lower === TRANSACTION_TYPES.INCOME) {
    const match = nameToCategoryMap.get(DEFAULT_FALLBACK_CATEGORIES.INCOME.toLowerCase()) || nameToCategoryMap.get(DEFAULT_INCOME_CATEGORY.toLowerCase());
    if (match) return match.name;
  }
  if (lower === TRANSACTION_TYPES.EXPENSE) {
    const match = nameToCategoryMap.get(DEFAULT_FALLBACK_CATEGORIES.EXPENSE.toLowerCase());
    if (match) return match.name;
  }

  // 1. Fast O(1) in-memory lookup
  const cached = nameToCategoryMap.get(lower);
  if (cached) return cached.name;

  // 2. Semantic category matching for merchant / shop names
  const matchedKeyword = matchCategoryKeyword(lower);
  if (matchedKeyword) {
    const matched = nameToCategoryMap.get(matchedKeyword.toLowerCase());
    if (matched) return matched.name;
  }

  // 3. Fallback to default system category (Other, Other Income, or Transfer)
  const fallbackCat = nameToCategoryMap.get(defaultFallback.toLowerCase());
  return fallbackCat?.name || defaultFallback;
}
