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

  // "Ask your ledger" agent. Its model must support tool calling in Ollama (gemma3 does not).
  agent: {
    model: process.env.OLLAMA_AGENT_MODEL || 'qwen2.5:7b',
    maxSteps: parseInt(process.env.AGENT_MAX_STEPS, 10) || 6,
    timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS, 10) || 90_000,
    maxConcurrent: parseInt(process.env.AGENT_MAX_CONCURRENT, 10) || 2,
    // Log every SQL statement the agent's tools run, as sent to Postgres (dev aid).
    logSql: process.env.AGENT_LOG_SQL === 'true',
    // Password of the read-only `ledger_agent` Postgres role the agent's tools connect as.
    dbPassword: process.env.DB_AGENT_PASSWORD || 'ledger_agent_password',
  },

  // Calendar months and "today" for the agent are computed in this zone (the DB stores UTC).
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',

  defaults: {
    account: process.env.DEFAULT_ACCOUNT || 'Union Bank',
    expenseCategory: process.env.DEFAULT_EXPENSE_CATEGORY || 'Other',
    incomeCategory: process.env.DEFAULT_INCOME_CATEGORY || 'Other Income',
    currencySymbol: process.env.CURRENCY_SYMBOL || '₹',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    // Comma-separated chat ids allowed to use the bot. Empty = anyone (logged as a warning).
    allowedChatIds: (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
  },
};

export default env;
