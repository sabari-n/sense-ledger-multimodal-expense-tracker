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

/**
 * Write helpers accept `{ transaction }`. Inside a transaction the cache is NOT rebuilt
 * (it reads on a different connection and would miss uncommitted rows) — the caller must
 * call rebuildAccountCache() after commit.
 */
export async function create(data, options = {}) {
  const instance = await Account.create(data, { transaction: options.transaction });
  const plain = instance.get({ plain: true });
  if (!options.transaction) await loadAccountCache();
  return plain;
}

export async function update(id, data, options = {}) {
  await Account.update(data, { where: { id }, transaction: options.transaction });
  const fresh = await Account.findByPk(id, { raw: true, transaction: options.transaction });
  if (!options.transaction) await loadAccountCache();
  return fresh;
}

export async function destroyById(id, options = {}) {
  const result = await Account.destroy({ where: { id: Number(id) }, transaction: options.transaction });
  if (!options.transaction) await loadAccountCache();
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
