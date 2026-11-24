import fs from 'fs';
import sequelize, { Account, Category } from '../models/index.js';
import { logger } from './logger.js';
import { runMigrations } from '../db/migrate.js';

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

    // Schema is owned by versioned migrations (src/migrations), not sequelize.sync().
    await runMigrations();

    // Seed missing categories from JSON configuration
    for (const cat of DEFAULT_CATEGORIES) {
      const { keywords, ...fields } = cat; // keywords feed heuristics, not the table
      await Category.findOrCreate({
        where: { name: fields.name },
        defaults: fields,
      });
    }
    logger.info('Categories synchronised with config.');

    // Seed missing accounts. Only one account may be the default (unique index), so a seed's
    // is_default flag only applies when no default exists yet.
    for (const { aliases, ...fields } of DEFAULT_ACCOUNTS) { // aliases feed heuristics, not the table
      const hasDefault = (await Account.count({ where: { is_default: true } })) > 0;
      await Account.findOrCreate({
        where: { name: fields.name },
        defaults: { ...fields, is_default: Boolean(fields.is_default) && !hasDefault },
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
