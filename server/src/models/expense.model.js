import { DataTypes } from 'sequelize';
import sequelize from './sequelize.js';

const Expense = sequelize.define('Expense', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  original_text: { type: DataTypes.TEXT, allowNull: false },
  amount: { type: DataTypes.DECIMAL, allowNull: false },
  category: { type: DataTypes.TEXT, allowNull: false },
  subcategory: { type: DataTypes.TEXT },
  transaction_type: { type: DataTypes.STRING, defaultValue: 'expense' },
  account: { type: DataTypes.STRING, defaultValue: 'Cash' },
  to_account: { type: DataTypes.STRING },
  date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'expenses',
  timestamps: false,
});

export default Expense;
