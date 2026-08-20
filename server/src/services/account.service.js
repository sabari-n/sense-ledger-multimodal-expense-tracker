import { UniqueConstraintError } from 'sequelize';
import * as accountRepo from '../repositories/account.repository.js';
import { resolveCategoryName } from '../repositories/category.repository.js';
import * as expenseRepo from '../repositories/expense.repository.js';
import { AppError } from '../errors/AppError.js';
import { NOT_FOUND, VALIDATION_ERROR, DUPLICATE_ENTRY, BAD_REQUEST } from '../errors/errorCodes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Merge source stats + transfer stats and compute balance per account name.
 */
function buildBalanceMap(sourceStats, transferStats) {
  const map = {};
  [...sourceStats, ...transferStats].forEach(row => {
    if (!map[row.acc]) map[row.acc] = { income: 0, expense: 0 };
    map[row.acc].income  += parseFloat(row.total_income);
    map[row.acc].expense += parseFloat(row.total_expense);
  });
  Object.values(map).forEach(b => { b.balance = b.income - b.expense; });
  return map;
}

// ─── Service methods ──────────────────────────────────────────────────────────

export async function getAccountsWithBalance() {
  const [accounts, sourceStats, transferStats] = await Promise.all([
    accountRepo.findAll(),
    expenseRepo.getSourceStats(),
    expenseRepo.getTransferStats(),
  ]);

  const balanceMap = buildBalanceMap(sourceStats, transferStats);

  return accounts.map(acc => ({
    ...acc,
    computed_balance: parseFloat(acc.balance || 0),
    total_income:     balanceMap[acc.name]?.income  || 0,
    total_expense:    balanceMap[acc.name]?.expense || 0,
  }));
}

export async function createAccount(data) {
  const { name, account_type, balance, icon, color, include_in_total } = data;
  if (!name) throw new AppError('Account name is required.', VALIDATION_ERROR.status, VALIDATION_ERROR.code);

  try {
    return accountRepo.create({
      name,
      account_type:     account_type     || 'general',
      balance:          balance          || 0,
      icon:             icon             || 'fa-wallet',
      color:            color            || '#3b82f6',
      include_in_total: include_in_total !== false,
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw new AppError('An account with this name already exists.', DUPLICATE_ENTRY.status, DUPLICATE_ENTRY.code);
    }
    throw err;
  }
}

export async function updateAccount(id, data) {
  const existing = await accountRepo.findById(id);
  if (!existing) throw new AppError('Account not found.', NOT_FOUND.status, NOT_FOUND.code);

  const oldName = existing.name;
  const { name, account_type, balance, icon, color, include_in_total } = data;

  try {
    const updated = await accountRepo.update(id, {
      name:             name             || oldName,
      account_type:     account_type     || 'general',
      balance:          balance          || 0,
      icon:             icon             || 'fa-wallet',
      color:            color            || '#3b82f6',
      include_in_total: include_in_total !== false,
    });

    if (name && name !== oldName) {
      await expenseRepo.updateAccountName(oldName, name);
    }

    return updated;
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw new AppError('An account with this name already exists.', DUPLICATE_ENTRY.status, DUPLICATE_ENTRY.code);
    }
    throw err;
  }
}

export async function deleteAccount(id) {
  const account = await accountRepo.findById(id);
  if (!account) throw new AppError('Account not found.', NOT_FOUND.status, NOT_FOUND.code);
  if (account.is_default) throw new AppError('Cannot delete the default account.', BAD_REQUEST.status, BAD_REQUEST.code);

  const defaultAccount = await accountRepo.findOne({ is_default: true });
  const defaultName    = defaultAccount?.name || 'Cash';

  await expenseRepo.updateAccountName(account.name, defaultName);
  await accountRepo.destroyById(id);

  return { message: `Account deleted. Transactions moved to ${defaultName}.` };
}

export async function transferBetweenAccounts(data) {
  const { from_account, to_account, amount, description } = data;
  if (!from_account || !to_account || !amount) {
    throw new AppError('from_account, to_account, and amount are required.', VALIDATION_ERROR.status, VALIDATION_ERROR.code);
  }

  const fromAcc = await accountRepo.resolveAccountName(from_account);
  const toAcc = await accountRepo.resolveAccountName(to_account);
  const transferCategory = await resolveCategoryName('Transfer', 'transfer');

  await expenseRepo.create({
    original_text:    description || 'Transfer',
    amount,
    category:         transferCategory,
    subcategory:      '',
    transaction_type: 'transfer',
    account:          fromAcc,
    to_account:       toAcc,
  });

  return { message: 'Transfer completed successfully.' };
}
