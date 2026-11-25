import { Op, QueryTypes, col } from 'sequelize';
import sequelize, { Expense, Account, Category } from '../models/index.js'; // index registers associations
import * as accountRepo from './account.repository.js';
import * as categoryRepo from './category.repository.js';
import { AppError } from '../errors/AppError.js';
import { VALIDATION_ERROR } from '../errors/errorCodes.js';
import { TRANSACTION_TYPES } from '../utils/enums.js';

/*
 * Expenses reference accounts and categories by id. This repository is the only place that
 * knows that: callers read rows with `account`, `to_account` and `category` names (as the API
 * always returned) and may write either names or the *_id columns.
 */

// ─── Read shape ───────────────────────────────────────────────────────────────

// Flat rows: related names are pulled up next to the ids (`account`, `to_account`, `category`).
const READ_OPTIONS = {
  attributes: [
    'id', 'original_text', 'amount',
    [col('categoryRef.name'), 'category'],
    'subcategory', 'transaction_type',
    [col('accountRef.name'), 'account'],
    [col('toAccountRef.name'), 'to_account'],
    'date', 'source', 'account_id', 'to_account_id', 'category_id', 'created_at', 'updated_at',
  ],
  include: [
    { model: Account,  as: 'accountRef',   attributes: [], required: true },
    { model: Account,  as: 'toAccountRef', attributes: [], required: false },
    { model: Category, as: 'categoryRef',  attributes: [], required: true },
  ],
  raw: true,
};

// ─── Write mapping (names → ids) ──────────────────────────────────────────────

const PLAIN_COLUMNS = ['original_text', 'amount', 'subcategory', 'transaction_type', 'date', 'source',
  'account_id', 'to_account_id', 'category_id'];

async function accountIdFor(name) {
  const acc = await accountRepo.findOne({ name });
  if (!acc) throw new AppError(`Unknown account: ${name}.`, VALIDATION_ERROR.status, VALIDATION_ERROR.code);
  return acc.id;
}

async function categoryIdFor(name) {
  const cat = await categoryRepo.findByName(name);
  if (!cat) throw new AppError(`Unknown category: ${name}.`, VALIDATION_ERROR.status, VALIDATION_ERROR.code);
  return cat.id;
}

/** Translate an API/service-shaped object into table columns. Undefined fields are left out. */
async function toColumns(data) {
  const cols = {};
  for (const key of PLAIN_COLUMNS) {
    if (data[key] !== undefined) cols[key] = data[key];
  }
  if (data.account !== undefined && cols.account_id === undefined) {
    cols.account_id = await accountIdFor(data.account);
  }
  if (data.to_account !== undefined && cols.to_account_id === undefined) {
    cols.to_account_id = data.to_account ? await accountIdFor(data.to_account) : null;
  }
  if (data.category !== undefined && cols.category_id === undefined) {
    cols.category_id = await categoryIdFor(data.category);
  }
  return cols;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function findAll() {
  return Expense.findAll({ ...READ_OPTIONS, order: [['date', 'DESC'], ['id', 'DESC']] });
}

export async function findById(id, options = {}) {
  return Expense.findOne({ ...READ_OPTIONS, where: { id: Number(id) }, transaction: options.transaction });
}

export async function create(data, options = {}) {
  const cols = await toColumns(data);
  const instance = await Expense.create(cols, { transaction: options.transaction });
  return findById(instance.id, options);
}

export async function update(id, data, options = {}) {
  const cols = await toColumns(data);
  if (Object.keys(cols).length) {
    await Expense.update(cols, { where: { id }, transaction: options.transaction });
  }
  return findById(id, options);
}

export async function destroy(id, options = {}) {
  return Expense.destroy({ where: { id }, transaction: options.transaction });
}

/**
 * Move every transaction of one account (as source or transfer destination) to another.
 * Transfers between the two would become self-transfers, which never moved money, so they
 * are removed first.
 */
export async function reassignAccount(fromAccountId, toAccountId, options = {}) {
  const { transaction } = options;
  await Expense.destroy({
    where: {
      transaction_type: TRANSACTION_TYPES.TRANSFER,
      [Op.or]: [
        { account_id: fromAccountId, to_account_id: toAccountId },
        { account_id: toAccountId,   to_account_id: fromAccountId },
      ],
    },
    transaction,
  });
  await Expense.update({ account_id: toAccountId },    { where: { account_id: fromAccountId },    transaction });
  await Expense.update({ to_account_id: toAccountId }, { where: { to_account_id: fromAccountId }, transaction });
}

// ─── Balances ─────────────────────────────────────────────────────────────────

/**
 * Per-account totals.
 *
 * Plain SQL on purpose: each account joins rows where it is the source OR the transfer
 * destination, with conditional sums — in the ORM that is a custom `on` plus literal CASE
 * expressions, i.e. the same SQL in harder-to-read wrappers. `total_income` = income + transfers in, `total_expense` = expenses +
 * transfers out, `balance` = the difference. Accounts without transactions are included.
 *
 * `connection` runs the query elsewhere: anything with Sequelize's `query(sql, options)`.
 * The agent passes its read-only handle (agent/db.js#readOnlyDb), so balances have one
 * definition shared by the app and the agent.
 *
 * @param {{ accountId?: number, transaction?: object, connection?: { query: Function } }} [options]
 * @returns {Promise<Array<{account_id:number, total_income:number, total_expense:number, balance:number}>>}
 */
export async function getAccountTotals(options = {}) {
  const db = options.connection || sequelize;
  const rows = await db.query(
    `SELECT a.id AS account_id,
            COALESCE(SUM(CASE WHEN e.account_id = a.id AND e.transaction_type = 'income' THEN e.amount
                              WHEN e.to_account_id = a.id THEN e.amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN e.account_id = a.id AND e.transaction_type <> 'income' THEN e.amount
                              ELSE 0 END), 0) AS total_expense
     FROM accounts a
     LEFT JOIN expenses e ON e.account_id = a.id OR e.to_account_id = a.id
     ${options.accountId ? 'WHERE a.id = :accountId' : ''}
     GROUP BY a.id`,
    { replacements: { accountId: options.accountId }, type: QueryTypes.SELECT, transaction: options.transaction }
  );
  return rows.map((r) => {
    const income = parseFloat(r.total_income);
    const expense = parseFloat(r.total_expense);
    return {
      account_id: r.account_id,
      total_income: income,
      total_expense: expense,
      balance: Math.round((income - expense) * 100) / 100,
    };
  });
}

export async function getAccountBalance(accountId, options = {}) {
  const [row] = await getAccountTotals({ ...options, accountId });
  return row ? row.balance : 0;
}
