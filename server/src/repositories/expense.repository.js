import { Op, fn, col, literal } from 'sequelize';
import Expense from '../models/expense.model.js';
import sequelize from '../models/sequelize.js';
import { applyTransactionBalance, revertTransactionBalance, loadAccountCache } from './account.repository.js';

export async function findAll() {
  return Expense.findAll({ order: [['date', 'DESC']], raw: true });
}

export async function findById(id, options = {}) {
  return Expense.findByPk(id, { raw: true, transaction: options.transaction });
}

export async function create(data) {
  const result = await sequelize.transaction(async (t) => {
    const instance = await Expense.create(data, { transaction: t });
    const plain = instance.get({ plain: true });
    await applyTransactionBalance(plain, { transaction: t });
    return plain;
  });

  await loadAccountCache();
  return result;
}

export async function update(id, data) {
  const result = await sequelize.transaction(async (t) => {
    const oldExpense = await findById(id, { transaction: t });
    if (oldExpense) {
      await revertTransactionBalance(oldExpense, { transaction: t });
    }

    await Expense.update(data, { where: { id }, transaction: t });
    const updatedExpense = await findById(id, { transaction: t });
    if (updatedExpense) {
      await applyTransactionBalance(updatedExpense, { transaction: t });
    }
    return updatedExpense;
  });

  await loadAccountCache();
  return result;
}

export async function destroy(id) {
  const result = await sequelize.transaction(async (t) => {
    const oldExpense = await findById(id, { transaction: t });
    if (oldExpense) {
      await revertTransactionBalance(oldExpense, { transaction: t });
    }
    return Expense.destroy({ where: { id }, transaction: t });
  });

  await loadAccountCache();
  return result;
}

/**
 * Bulk-update the `account` field for all expenses whose account matches oldName.
 */
export async function updateAccountName(oldName, newName) {
  return Expense.update({ account: newName }, { where: { account: oldName } });
}

// ─── Stats for account balance computation ────────────────────────────────────

/**
 * Sum income and expense amounts grouped by source account.
 */
export async function getSourceStats() {
  return Expense.findAll({
    attributes: [
      ['account', 'acc'],
      [fn('COALESCE', fn('SUM', literal("CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END")), 0), 'total_income'],
      [fn('COALESCE', fn('SUM', literal("CASE WHEN transaction_type IN ('expense', 'transfer') THEN amount ELSE 0 END")), 0), 'total_expense'],
    ],
    group: ['account'],
    raw: true,
  });
}

/**
 * Sum incoming transfer amounts grouped by destination account.
 */
export async function getTransferStats() {
  return Expense.findAll({
    attributes: [
      ['to_account', 'acc'],
      [fn('COALESCE', fn('SUM', col('amount')), 0), 'total_income'],
      [literal('0'), 'total_expense'],
    ],
    where: { transaction_type: 'transfer', to_account: { [Op.ne]: null } },
    group: ['to_account'],
    raw: true,
  });
}

// ─── Telegram bot query helpers ───────────────────────────────────────────────

/**
 * Return aggregated income/expense/count for expenses in [today, tomorrow).
 */
export async function getDailySummary(today, tomorrow) {
  return Expense.findOne({
    attributes: [
      [fn('COALESCE', fn('SUM', literal("CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END")), 0), 'total_expense'],
      [fn('COALESCE', fn('SUM', literal("CASE WHEN transaction_type = 'income'  THEN amount ELSE 0 END")), 0), 'total_income'],
      [fn('COUNT', col('id')), 'total_count'],
    ],
    where: { date: { [Op.gte]: today, [Op.lt]: tomorrow } },
    raw: true,
  });
}

/**
 * Return the most recent `limit` transactions.
 */
export async function getRecent(limit = 10) {
  return Expense.findAll({ order: [['date', 'DESC']], limit, raw: true });
}

/**
 * Return expenses since `startOfMonth`, grouped by category + transaction_type,
 * ordered by total descending.
 */
export async function getMonthlyCategoryBreakdown(startOfMonth) {
  return Expense.findAll({
    attributes: [
      'category',
      'transaction_type',
      [fn('SUM', col('amount')), 'total'],
      [fn('COUNT', col('id')), 'count'],
    ],
    where:  { date: { [Op.gte]: startOfMonth } },
    group:  ['category', 'transaction_type'],
    order:  [[fn('SUM', col('amount')), 'DESC']],
    raw:    true,
  });
}
