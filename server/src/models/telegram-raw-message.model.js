import { DataTypes } from 'sequelize';
import sequelize from './sequelize.js';

const TelegramRawMessage = sequelize.define('TelegramRawMessage', {
  id:           { type: DataTypes.INTEGER,    primaryKey: true, autoIncrement: true },
  chat_id:      { type: DataTypes.BIGINT,     allowNull: false },
  message_type: { type: DataTypes.STRING(20), allowNull: false },
  raw_text:     { type: DataTypes.TEXT,       allowNull: false },
  status:       { type: DataTypes.STRING(20), defaultValue: 'pending' },
}, {
  tableName:  'telegram_raw_messages',
  timestamps: true,
  createdAt:  'created_at',
  updatedAt:  false,
});

export default TelegramRawMessage;
