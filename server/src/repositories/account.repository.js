import { fn, col, where as seqWhere } from 'sequelize';
import Account from '../models/account.model.js';
import { env } from '../config/env.js';
import { matchAccountAlias } from '../utils/heuristics.js';

// ─── In-Memory Cache ─────────────────────────────────────────────────────────
const idToAccountMap = new Map();
const nameToAccountMap = new Map();
let defaultAccount = null;
let isCacheLoaded = false;

/**
 * Populate or refresh the in-memory cache of accounts and IDs from DB.
 */
export async function loadAccountCache() {
  const accounts = await Account.findAll({
    order: [['is_default', 'DESC'], ['created_at', 'ASC']],
    raw: true,
  });

  idToAccountMap.clear();
  nameToAccountMap.clear();
  defaultAccount = null;

  for (const acc of accounts) {
    idToAccountMap.set(acc.id, acc);
    nameToAccountMap.set(acc.name.toLowerCase().trim(), acc);
    if (acc.is_default && !defaultAccount) {
      defaultAccount = acc;
    }
  }

  if (!defaultAccount && accounts.length > 0) {
    defaultAccount = accounts[0];
  }

  isCacheLoaded = true;
  return accounts;
}

/**
 * Ensure in-memory cache is loaded before any lookup.
 */
async function ensureCache() {
  if (!isCacheLoaded || idToAccountMap.size === 0) {
    await loadAccountCache();
  }
}

/**
 * Return all accounts from memory.
 */
export async function getInMemoryAccounts() {
  await ensureCache();
  return Array.from(idToAccountMap.values());
}

/**
 * Return the in-memory ID -> Account map.
 */
export async function getAccountIdMap() {
  await ensureCache();
  return idToAccountMap;
}

/**
 * Return the in-memory Name -> Account map.
 */
export async function getAccountNameMap() {
  await ensureCache();
  return nameToAccountMap;
}

export async function findAll() {
  await ensureCache();
  return Array.from(idToAccountMap.values());
}

export async function findById(id) {
  await ensureCache();
  return idToAccountMap.get(Number(id)) || null;
}

export async function findOne(where = {}) {
  await ensureCache();
  if (where.name) {
    return nameToAccountMap.get(where.name.toLowerCase().trim()) || null;
  }
  if (where.id) {
    return idToAccountMap.get(Number(where.id)) || null;
  }
  if (where.is_default !== undefined) {
    return Array.from(idToAccountMap.values()).find(a => Boolean(a.is_default) === Boolean(where.is_default)) || null;
  }
  return Account.findOne({ where, raw: true });
}

export async function create(data) {
  const instance = await Account.create(data);
  const plain = instance.get({ plain: true });

  // Rebuild entire in-memory cache from database on change
  await loadAccountCache();

  return plain;
}

export async function update(id, data) {
  await Account.update(data, { where: { id } });
  const fresh = await Account.findByPk(id, { raw: true });

  // Rebuild entire in-memory cache from database on change
  await loadAccountCache();

  return fresh;
}

export async function destroyById(id) {
  const result = await Account.destroy({ where: { id: Number(id) } });

  // Rebuild entire in-memory cache from database on change
  await loadAccountCache();

  return result;
}

/**
 * Explicit alias to trigger cache rebuild.
 */
export const rebuildAccountCache = loadAccountCache;

export async function count() {
  await ensureCache();
  return idToAccountMap.size;
}

/**
 * Ensure an account exists by name for foreign key integrity.
 * Instant O(1) in-memory lookup. If no account is matched, fallback to Union Bank only.
 */
export async function resolveAccountName(accountName, fallbackDefault = true) {
  await ensureCache();

  const defaultAccName = defaultAccount?.name || env.defaults?.account || 'Union Bank';

  if (!accountName || typeof accountName !== 'string' || !accountName.trim()) {
    if (!fallbackDefault) return null;
    return defaultAccName;
  }

  const trimmed = accountName.trim();
  const lower = trimmed.toLowerCase();

  // 1. Exact / In-memory lookup
  const cached = nameToAccountMap.get(lower);
  if (cached) return cached.name;

  // 2. Intelligent alias / partial matching against configured account rules
  const matchedAlias = matchAccountAlias(lower);
  if (matchedAlias) {
    const acc = nameToAccountMap.get(matchedAlias.toLowerCase());
    if (acc) return acc.name;
  }

  // 3. If not found or single random characters like 'S', use fallback default
  if (!fallbackDefault) return null;
  return defaultAccName;
}

/**
 * Adjust the balance of an account in PostgreSQL by delta (can be positive or negative)
 * and update the in-memory cache.
 */
export async function adjustAccountBalance(accountName, delta, options = {}) {
  if (!accountName || !delta || isNaN(delta)) return;

  await Account.increment('balance', {
    by: delta,
    where: { name: accountName },
    transaction: options.transaction,
  });

  if (!options.transaction) {
    await loadAccountCache();
  }
}

/**
 * Apply the balance changes of a new transaction to PostgreSQL account(s).
 */
export async function applyTransactionBalance(transaction, options = {}) {
  if (!transaction || !transaction.amount) return;
  const amount = parseFloat(transaction.amount);
  if (isNaN(amount) || amount === 0) return;

  const type = transaction.transaction_type?.toLowerCase() || 'expense';

  if (type === 'income') {
    await adjustAccountBalance(transaction.account, +amount, options);
  } else if (type === 'expense') {
    await adjustAccountBalance(transaction.account, -amount, options);
  } else if (type === 'transfer') {
    await adjustAccountBalance(transaction.account, -amount, options);
    if (transaction.to_account) {
      await adjustAccountBalance(transaction.to_account, +amount, options);
    }
  }
}

/**
 * Revert the balance changes of a transaction from PostgreSQL account(s).
 */
export async function revertTransactionBalance(transaction, options = {}) {
  if (!transaction || !transaction.amount) return;
  const amount = parseFloat(transaction.amount);
  if (isNaN(amount) || amount === 0) return;

  const type = transaction.transaction_type?.toLowerCase() || 'expense';

  if (type === 'income') {
    await adjustAccountBalance(transaction.account, -amount, options);
  } else if (type === 'expense') {
    await adjustAccountBalance(transaction.account, +amount, options);
  } else if (type === 'transfer') {
    await adjustAccountBalance(transaction.account, +amount, options);
    if (transaction.to_account) {
      await adjustAccountBalance(transaction.to_account, -amount, options);
    }
  }
}

/**
 * Recalculate and sync all account balances in PostgreSQL based on all existing expenses.
 */
export async function syncAllAccountBalances() {
  const { default: sequelize } = await import('../models/sequelize.js');

  await sequelize.query(`
    UPDATE accounts a
    SET balance = COALESCE(src.income, 0) - COALESCE(src.expense, 0) + COALESCE(dst.transfer_in, 0)
    FROM (
      SELECT account,
             COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) AS income,
             COALESCE(SUM(CASE WHEN transaction_type IN ('expense', 'transfer') THEN amount ELSE 0 END), 0) AS expense
      FROM expenses
      GROUP BY account
    ) src
    FULL OUTER JOIN (
      SELECT to_account,
             COALESCE(SUM(amount), 0) AS transfer_in
      FROM expenses
      WHERE transaction_type = 'transfer' AND to_account IS NOT NULL
      GROUP BY to_account
    ) dst ON src.account = dst.to_account
    WHERE a.name = COALESCE(src.account, dst.to_account);
  `);

  await loadAccountCache();
}


