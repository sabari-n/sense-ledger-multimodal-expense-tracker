import { DataTypes } from 'sequelize';
import sequelize from './sequelize.js';

const Category = sequelize.define('Category', {
  id:               { type: DataTypes.INTEGER,     primaryKey: true, autoIncrement: true },
  name:             { type: DataTypes.STRING(100), allowNull: false, unique: true },
  emoji:            { type: DataTypes.STRING(20),  allowNull: false, defaultValue: '📋' },
  transaction_type: { type: DataTypes.STRING(20),  allowNull: false, defaultValue: 'expense' },
  subcategories:    { type: DataTypes.JSONB,       allowNull: false, defaultValue: [] },
  is_system:        { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },
  sort_order:       { type: DataTypes.INTEGER,     allowNull: false, defaultValue: 99 },
}, {
  tableName:  'categories',
  timestamps: true,
  createdAt:  'created_at',
  updatedAt:  'updated_at',
});

export default Category;
