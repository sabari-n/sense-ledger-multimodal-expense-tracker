import sequelize from './sequelize.js';

export default sequelize;
export { sequelize };

// Import models
import Expense from './expense.model.js';
import Account from './account.model.js';
import Category from './category.model.js';
import TelegramRawMessage from './telegram-raw-message.model.js';

// Setup relationships
// 1. Account <-> Expense
Account.hasMany(Expense, {
  foreignKey: 'account',
  sourceKey: 'name',
  as: 'expenses',
  onDelete: 'NO ACTION',
  onUpdate: 'CASCADE',
  constraints: false,
});
Expense.belongsTo(Account, {
  foreignKey: 'account',
  targetKey: 'name',
  as: 'accountDetails',
  onDelete: 'NO ACTION',
  onUpdate: 'CASCADE',
  constraints: false,
});

Account.hasMany(Expense, {
  foreignKey: 'to_account',
  sourceKey: 'name',
  as: 'incomingTransfers',
  onDelete: 'NO ACTION',
  onUpdate: 'CASCADE',
  constraints: false,
});
Expense.belongsTo(Account, {
  foreignKey: 'to_account',
  targetKey: 'name',
  as: 'toAccountDetails',
  onDelete: 'NO ACTION',
  onUpdate: 'CASCADE',
  constraints: false,
});

// 2. Category <-> Expense
Category.hasMany(Expense, {
  foreignKey: 'category',
  sourceKey: 'name',
  as: 'expenses',
  onDelete: 'NO ACTION',
  onUpdate: 'CASCADE',
  constraints: false,
});
Expense.belongsTo(Category, {
  foreignKey: 'category',
  targetKey: 'name',
  as: 'categoryDetails',
  onDelete: 'NO ACTION',
  onUpdate: 'CASCADE',
  constraints: false,
});

export {
  Expense,
  Account,
  Category,
  TelegramRawMessage,
};

