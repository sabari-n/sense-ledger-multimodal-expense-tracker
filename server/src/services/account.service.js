import { UniqueConstraintError } from 'sequelize';
import sequelize from '../models/sequelize.js';
import * as accountRepo from '../repositories/account.repository.js';
import { resolveCategoryName } from '../repositories/category.repository.js';
import * as expenseRepo from '../repositories/expense.repository.js';
import { AppError } from '../errors/AppError.js';
import { NOT_FOUND, VALIDATION_ERROR, DUPLICATE_ENTRY, BAD_REQUEST } from '../errors/errorCodes.js';
import { TRANSACTION_TYPES, TRANSACTION_SOURCES } from '../utils/enums.js';

/*
 * Balances are never stored: an account's balance is the sum of its transactions.
 * Setting a balance (on create or edit) therefore records an adjustment transaction.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(n * 100) / 100;

/** Record a ledger entry that moves an account's balance by `delta`. */
async function recordBalanceAdjustment(accountId, delta, description, options = {}) {
  const amount = round2(delta);
  if (!amount) return;

  const transaction_type = amount > 0 ? TRANSACTION_TYPES.INCOME : TRANSACTION_TYPES.EXPENSE;
  await expenseRepo.create({
    original_text: description,
    amount:        Math.abs(amount),
    category:      await resolveCategoryName('Balance Adjustment', transaction_type),
    subcategory:   '',
    transaction_type,
    account_id:    accountId,
    source:        TRANSACTION_SOURCES.ADJUSTMENT,
  }, options);
}

function hasValue(v) {
  return v !== undefined && v !== null && v !== '';
}

function rethrowDuplicate(err) {
  if (err instanceof UniqueConstraintError) {
    throw new AppError('An account with this name already exists.', DUPLICATE_ENTRY.status, DUPLICATE_ENTRY.code);
  }
  throw err;
}

/** Run `work` in a DB transaction, then refresh the account cache once it has committed. */
async function inTransaction(work) {
  try {
    return await sequelize.transaction(work);
  } finally {
    await accountRepo.rebuildAccountCache();
  }
}

// ─── Service methods ──────────────────────────────────────────────────────────

export async function getAccountsWithBalance() {
  const [accounts, totals] = await Promise.all([
    accountRepo.findAll(),
    expenseRepo.getAccountTotals(),
  ]);
  const byId = new Map(totals.map((t) => [t.account_id, t]));

  return accounts.map((acc) => {
    const t = byId.get(acc.id) || { total_income: 0, total_expense: 0, balance: 0 };
    return {
      ...acc,
      balance:          t.balance,
      computed_balance: t.balance, // kept for API compatibility
      total_income:     t.total_income,
      total_expense:    t.total_expense,
    };
  });
}

export async function createAccount(data) {
  const { name, account_type, balance, icon, color, include_in_total } = data;
  if (!name) throw new AppError('Account name is required.', VALIDATION_ERROR.status, VALIDATION_ERROR.code);

  try {
    const created = await inTransaction(async (transaction) => {
      const acc = await accountRepo.create({
        name:             name.trim(),
        account_type:     account_type || 'general',
        icon:             icon         || 'fa-wallet',
        color:            color        || '#3b82f6',
        include_in_total: include_in_total !== false,
      }, { transaction });

      if (hasValue(balance)) {
        await recordBalanceAdjustment(acc.id, parseFloat(balance), 'Opening balance', { transaction });
      }
      return acc;
    });
    return { ...created, balance: await expenseRepo.getAccountBalance(created.id) };
  } catch (err) {
    rethrowDuplicate(err);
  }
}

export async function updateAccount(id, data) {
  const existing = await accountRepo.findById(id);
  if (!existing) throw new AppError('Account not found.', NOT_FOUND.status, NOT_FOUND.code);

  const { name, account_type, balance, icon, color, include_in_total } = data;

  try {
    await inTransaction(async (transaction) => {
      // Fields that aren't sent keep their current value.
      await accountRepo.update(id, {
        name:             name?.trim()     || existing.name,
        account_type:     account_type     ?? existing.account_type,
        icon:             icon             ?? existing.icon,
        color:            color            ?? existing.color,
        include_in_total: include_in_total ?? existing.include_in_total,
      }, { transaction });

      if (hasValue(balance)) {
        const current = await expenseRepo.getAccountBalance(existing.id, { transaction });
        await recordBalanceAdjustment(existing.id, parseFloat(balance) - current, 'Balance adjustment', { transaction });
      }
    });
  } catch (err) {
    rethrowDuplicate(err);
  }

  const updated = await accountRepo.findById(id);
  return { ...updated, balance: await expenseRepo.getAccountBalance(updated.id) };
}

export async function deleteAccount(id) {
  const account = await accountRepo.findById(id);
  if (!account) throw new AppError('Account not found.', NOT_FOUND.status, NOT_FOUND.code);
  if (account.is_default) throw new AppError('Cannot delete the default account.', BAD_REQUEST.status, BAD_REQUEST.code);

  const defaultAccount = await accountRepo.findOne({ is_default: true });
  if (!defaultAccount) throw new AppError('No default account to move transactions to.', BAD_REQUEST.status, BAD_REQUEST.code);

  // Transactions move to the default account, so its balance absorbs this account's balance.
  await inTransaction(async (transaction) => {
    await expenseRepo.reassignAccount(account.id, defaultAccount.id, { transaction });
    await accountRepo.destroyById(account.id, { transaction });
  });

  return { message: `Account deleted. Transactions moved to ${defaultAccount.name}.` };
}

export async function transferBetweenAccounts(data) {
  const { from_account, to_account, amount, description, date } = data;
  if (!from_account || !to_account || !amount) {
    throw new AppError('from_account, to_account, and amount are required.', VALIDATION_ERROR.status, VALIDATION_ERROR.code);
  }

  // No default-account fallback: an unknown name must not silently become the default account.
  const fromAcc = await accountRepo.resolveAccountName(from_account, false);
  const toAcc = await accountRepo.resolveAccountName(to_account, false);
  if (!fromAcc || !toAcc) {
    throw new AppError(`Unknown account: ${!fromAcc ? from_account : to_account}.`, NOT_FOUND.status, NOT_FOUND.code);
  }
  if (fromAcc === toAcc) {
    throw new AppError('Cannot transfer to the same account.', VALIDATION_ERROR.status, VALIDATION_ERROR.code);
  }

  await expenseRepo.create({
    original_text:    description || 'Transfer',
    amount,
    category:         await resolveCategoryName('Transfer', TRANSACTION_TYPES.TRANSFER),
    subcategory:      '',
    transaction_type: TRANSACTION_TYPES.TRANSFER,
    account:          fromAcc,
    to_account:       toAcc,
    source:           TRANSACTION_SOURCES.MANUAL,
    ...(date ? { date: new Date(date) } : {}),
  });

  return { message: 'Transfer completed successfully.' };
}
