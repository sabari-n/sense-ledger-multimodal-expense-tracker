import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Look for .env in current directory or parent directory
const rootEnvPath = path.resolve(process.cwd(), '.env');
const parentEnvPath = path.resolve(process.cwd(), '../.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true });
} else if (fs.existsSync(parentEnvPath)) {
  dotenv.config({ path: parentEnvPath, override: true });
}

export const env = {
  port: parseInt(process.env.PORT, 10) || 9088,

  db: {
    name: process.env.DB_NAME || 'expense_db',
    user: process.env.DB_USER || 'expense_user',
    password: process.env.DB_PASSWORD || 'expense_password',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 6033,
  },

  ollama: {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'llama3.2:1b',
  },

  ocr: {
    url: process.env.OCR_URL || 'http://localhost:5001/ocr',
  },

  whisper: {
    url: process.env.WHISPER_URL || 'http://localhost:5000/transcribe',
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || '127.0.0.1:9092').split(','),
    topics: {
      audioIngestion: process.env.KAFKA_TOPIC_AUDIO_INGESTION || 'audio-ingestion-events',
      imageIngestion: process.env.KAFKA_TOPIC_IMAGE_INGESTION || 'image-ingestion-events',
      textExtracted: process.env.KAFKA_TOPIC_TEXT_EXTRACTED || 'text-extracted-events',
      expenseStructured: process.env.KAFKA_TOPIC_EXPENSE_STRUCTURED || 'expense-structured-events',
    },
  },

  defaults: {
    account: process.env.DEFAULT_ACCOUNT || 'Union Bank',
    expenseCategory: process.env.DEFAULT_EXPENSE_CATEGORY || 'Other',
    incomeCategory: process.env.DEFAULT_INCOME_CATEGORY || 'Other Income',
    currencySymbol: process.env.CURRENCY_SYMBOL || '₹',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
};

export default env;
