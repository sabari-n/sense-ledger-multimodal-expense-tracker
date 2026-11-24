import { DataTypes } from 'sequelize';
import sequelize from './sequelize.js';
import { TRANSACTION_TYPES, TRANSACTION_SOURCES } from '../utils/enums.js';

/**
 * A ledger entry (expense, income or transfer). Account balances are derived from these
 * rows — there is no stored balance to keep in sync.
 *
 * Schema is owned by migrations in src/migrations; keep this definition in step with them.
 */
const Expense = sequelize.define('Expense', {
  id:               { type: DataTypes.INTEGER,       primaryKey: true, autoIncrement: true },
  transaction_type: { type: DataTypes.STRING(20),    allowNull: false, defaultValue: TRANSACTION_TYPES.EXPENSE },
  amount:           { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  account_id:       { type: DataTypes.INTEGER,       allowNull: false },
  to_account_id:    { type: DataTypes.INTEGER },
  category_id:      { type: DataTypes.INTEGER,       allowNull: false },
  subcategory:      { type: DataTypes.TEXT,          allowNull: false, defaultValue: '' },
  original_text:    { type: DataTypes.TEXT,          allowNull: false },
  source:           { type: DataTypes.STRING(20),    allowNull: false, defaultValue: TRANSACTION_SOURCES.MANUAL },
  date:             { type: DataTypes.DATE,          allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName:  'expenses',
  timestamps: true,
  createdAt:  'created_at',
  updatedAt:  'updated_at',
});

export default Expense;
