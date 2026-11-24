import sequelize from './sequelize.js';

import Expense from './expense.model.js';
import Account from './account.model.js';
import Category from './category.model.js';
import TelegramRawMessage from './telegram-raw-message.model.js';

// Associations (FK constraints themselves are created by migrations, hence constraints: false).
Account.hasMany(Expense,  { foreignKey: 'account_id',    as: 'expenses',          constraints: false });
Account.hasMany(Expense,  { foreignKey: 'to_account_id', as: 'incomingTransfers', constraints: false });
Category.hasMany(Expense, { foreignKey: 'category_id',   as: 'expenses',          constraints: false });

Expense.belongsTo(Account,  { foreignKey: 'account_id',    as: 'accountRef',   constraints: false });
Expense.belongsTo(Account,  { foreignKey: 'to_account_id', as: 'toAccountRef', constraints: false });
Expense.belongsTo(Category, { foreignKey: 'category_id',   as: 'categoryRef',  constraints: false });

export default sequelize;
export { sequelize, Expense, Account, Category, TelegramRawMessage };
