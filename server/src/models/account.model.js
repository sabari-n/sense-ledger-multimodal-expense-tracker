import { DataTypes } from 'sequelize';
import sequelize from './sequelize.js';

const Account = sequelize.define('Account', {
  id:               { type: DataTypes.INTEGER,     primaryKey: true, autoIncrement: true },
  name:             { type: DataTypes.STRING(100), allowNull: false, unique: true },
  account_type:     { type: DataTypes.STRING(50),  defaultValue: 'general' },
  balance:          { type: DataTypes.DECIMAL,     defaultValue: 0 },
  icon:             { type: DataTypes.STRING(50),  defaultValue: 'fa-wallet' },
  color:            { type: DataTypes.STRING(20),  defaultValue: '#3b82f6' },
  is_default:       { type: DataTypes.BOOLEAN,     defaultValue: false },
  include_in_total: { type: DataTypes.BOOLEAN,     defaultValue: true },
}, {
  tableName:  'accounts',
  timestamps: true,
  createdAt:  'created_at',
  updatedAt:  false,
});

export default Account;
