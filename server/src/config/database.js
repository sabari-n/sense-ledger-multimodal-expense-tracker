import fs from 'fs';
import sequelize, { Expense, Account, Category, TelegramRawMessage } from '../models/index.js';
import { logger } from './logger.js';

// Keep references so all models are registered before sync
const _models = { Expense, Account, Category, TelegramRawMessage };

const DEFAULT_CATEGORIES = JSON.parse(
  fs.readFileSync(new URL('./categories.json', import.meta.url), 'utf-8')
);

const DEFAULT_ACCOUNTS = JSON.parse(
  fs.readFileSync(new URL('./accounts.json', import.meta.url), 'utf-8')
);

export async function initDB() {
  try {
    await sequelize.authenticate();
    logger.info('PostgreSQL connection established.');

    // Ensure categories table has unique constraint on name if table already exists
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'categories'
          ) THEN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'categories_name_unique'
            ) AND NOT EXISTS (
              SELECT 1 FROM pg_indexes WHERE tablename = 'categories' AND indexdef LIKE '%(name)%'
            ) THEN
              ALTER TABLE categories ADD CONSTRAINT categories_name_unique UNIQUE (name);
            END IF;
          END IF;
        END $$;
      `);
    } catch (e) {
      logger.warn('Schema setup note:', e.message);
    }

    await sequelize.sync({ alter: false });
    logger.info('Database models synchronised.');

    // Sync/Seed categories from JSON configuration
    for (const cat of DEFAULT_CATEGORIES) {
      await Category.findOrCreate({
        where: { name: cat.name },
        defaults: cat,
      });
    }
    logger.info('Categories synchronised with config.');

    // Sync/Seed accounts from JSON configuration
    for (const acc of DEFAULT_ACCOUNTS) {
      await Account.findOrCreate({
        where: { name: acc.name },
        defaults: acc,
      });
    }
    logger.info('Accounts synchronised with config.');

    // Warm in-memory caches
    const { loadCategoryCache } = await import('../repositories/category.repository.js');
    await loadCategoryCache();
    logger.info('In-memory category cache warmed.');

    const { loadAccountCache } = await import('../repositories/account.repository.js');
    await loadAccountCache();
    logger.info('In-memory account cache warmed.');

    logger.info('Database initialised successfully.');
  } catch (err) {
    logger.error('Failed to initialise database:', err);
    throw err;
  }
}

export default initDB;
