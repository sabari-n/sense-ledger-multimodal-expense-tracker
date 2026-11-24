import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { QueryTypes } from 'sequelize';
import sequelize from '../models/sequelize.js';
import { logger } from '../config/logger.js';

/**
 * Minimal, dependency-free migration runner.
 *
 * - Migrations live in src/migrations as `NNN_description.js`, applied in filename order.
 * - Each exports `async up({ query, sequelize, transaction })`.
 * - Each runs inside its own transaction (Postgres DDL is transactional), so a failing
 *   migration leaves the schema untouched.
 * - Applied names are recorded in `schema_migrations`; an advisory lock stops two
 *   server instances from migrating at the same time.
 *
 * To change the schema: add the next numbered file, never edit one that has shipped.
 */

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const LOCK_KEY = 7_261_042; // arbitrary constant for pg_advisory_xact_lock

export function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_[\w-]+\.js$/.test(f))
    .sort();
}

export async function runMigrations() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);

  const applied = [];
  for (const file of listMigrationFiles()) {
    const name = file.replace(/\.js$/, '');

    const ran = await sequelize.transaction(async (transaction) => {
      const query = (sql, options = {}) => sequelize.query(sql, { transaction, ...options });

      await query('SELECT pg_advisory_xact_lock(:key)', { replacements: { key: LOCK_KEY } });
      const done = await query('SELECT 1 FROM schema_migrations WHERE name = :name', {
        replacements: { name }, type: QueryTypes.SELECT,
      });
      if (done.length) return false;

      const migration = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
      logger.info(`[migrate] applying ${name}…`);
      await migration.up({ query, sequelize, transaction });
      await query('INSERT INTO schema_migrations (name) VALUES (:name)', { replacements: { name } });
      return true;
    });

    if (ran) applied.push(name);
  }

  logger.info(applied.length
    ? `[migrate] applied ${applied.length} migration(s): ${applied.join(', ')}`
    : '[migrate] schema is up to date');
  return applied;
}

// Allow `npm run migrate` to apply migrations without starting the server.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => sequelize.close())
    .catch((err) => {
      logger.error('[migrate] failed:', err);
      process.exit(1);
    });
}
