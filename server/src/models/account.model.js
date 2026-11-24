import { DataTypes } from 'sequelize';
import sequelize from './sequelize.js';

/**
 * An account (bank, cash, card…). Its balance is not stored: it is computed from the
 * account's transactions (see expense.repository#getAccountTotals).
 */
const Account = sequelize.define('Account', {
  id:               { type: DataTypes.INTEGER,     primaryKey: true, autoIncrement: true },
  name:             { type: DataTypes.STRING(100), allowNull: false, unique: true },
  account_type:     { type: DataTypes.STRING(50),  allowNull: false, defaultValue: 'general' },
  icon:             { type: DataTypes.STRING(50),  allowNull: false, defaultValue: 'fa-wallet' },
  color:            { type: DataTypes.STRING(20),  allowNull: false, defaultValue: '#3b82f6' },
  is_default:       { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
  include_in_total: { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
}, {
  tableName:  'accounts',
  timestamps: true,
  createdAt:  'created_at',
  updatedAt:  'updated_at',
});

export default Account;
