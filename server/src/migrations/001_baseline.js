/**
 * Baseline: the schema as it existed when tables were created by `sequelize.sync()`.
 *
 * Every statement is idempotent, so on an existing database this is a no-op, and on a
 * fresh database it creates the original tables that later migrations evolve.
 */
export async function up({ query }) {
  await query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id               SERIAL PRIMARY KEY,
      name             VARCHAR(100) NOT NULL UNIQUE,
      account_type     VARCHAR(50)  DEFAULT 'general',
      balance          NUMERIC      DEFAULT 0,
      icon             VARCHAR(50)  DEFAULT 'fa-wallet',
      color            VARCHAR(20)  DEFAULT '#3b82f6',
      is_default       BOOLEAN      DEFAULT false,
      include_in_total BOOLEAN      DEFAULT true,
      created_at       TIMESTAMPTZ  NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id               SERIAL PRIMARY KEY,
      name             VARCHAR(100) NOT NULL UNIQUE,
      emoji            VARCHAR(20)  DEFAULT '📋',
      transaction_type VARCHAR(20)  DEFAULT 'expense',
      subcategories    JSONB        DEFAULT '[]'::jsonb,
      is_system        BOOLEAN      DEFAULT false,
      sort_order       INTEGER      DEFAULT 99,
      created_at       TIMESTAMPTZ  NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id               SERIAL PRIMARY KEY,
      original_text    TEXT         NOT NULL,
      amount           NUMERIC      NOT NULL,
      category         TEXT         NOT NULL REFERENCES categories(name) ON UPDATE CASCADE,
      subcategory      TEXT,
      transaction_type VARCHAR(255) DEFAULT 'expense',
      account          VARCHAR(255) DEFAULT 'Cash' REFERENCES accounts(name) ON UPDATE CASCADE,
      to_account       VARCHAR(255) REFERENCES accounts(name) ON UPDATE CASCADE,
      date             TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS telegram_raw_messages (
      id           SERIAL PRIMARY KEY,
      chat_id      BIGINT       NOT NULL,
      message_type VARCHAR(20)  NOT NULL,
      raw_text     TEXT         NOT NULL,
      created_at   TIMESTAMPTZ  NOT NULL
    );

    -- Old column that nothing ever updated.
    ALTER TABLE telegram_raw_messages DROP COLUMN IF EXISTS status;
  `);
}
