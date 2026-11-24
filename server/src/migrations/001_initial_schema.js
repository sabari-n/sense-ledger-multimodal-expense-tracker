/**
 * Initial schema.
 *
 * expenses is the ledger: every expense, income and transfer. Account balances are derived
 * from it (there is no stored balance), and accounts/categories are referenced by id.
 */
export async function up({ query }) {
  await query(`
    CREATE TABLE accounts (
      id               SERIAL       PRIMARY KEY,
      name             VARCHAR(100) NOT NULL UNIQUE,
      account_type     VARCHAR(50)  NOT NULL DEFAULT 'general',
      icon             VARCHAR(50)  NOT NULL DEFAULT 'fa-wallet',
      color            VARCHAR(20)  NOT NULL DEFAULT '#3b82f6',
      is_default       BOOLEAN      NOT NULL DEFAULT false,
      include_in_total BOOLEAN      NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX accounts_name_lower_key ON accounts (lower(name));
    CREATE UNIQUE INDEX accounts_single_default ON accounts (is_default) WHERE is_default;

    CREATE TABLE categories (
      id               SERIAL       PRIMARY KEY,
      name             VARCHAR(100) NOT NULL UNIQUE,
      emoji            VARCHAR(20)  NOT NULL DEFAULT '📋',
      transaction_type VARCHAR(20)  NOT NULL DEFAULT 'expense',
      subcategories    JSONB        NOT NULL DEFAULT '[]'::jsonb,
      is_system        BOOLEAN      NOT NULL DEFAULT false,
      sort_order       INTEGER      NOT NULL DEFAULT 99,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT categories_transaction_type_valid CHECK (transaction_type IN ('expense', 'income', 'transfer'))
    );
    CREATE UNIQUE INDEX categories_name_lower_key ON categories (lower(name));

    CREATE TABLE expenses (
      id               SERIAL        PRIMARY KEY,
      transaction_type VARCHAR(20)   NOT NULL DEFAULT 'expense',
      amount           NUMERIC(14,2) NOT NULL,
      account_id       INTEGER       NOT NULL REFERENCES accounts(id)   ON DELETE RESTRICT,
      to_account_id    INTEGER                REFERENCES accounts(id)   ON DELETE RESTRICT,
      category_id      INTEGER       NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      subcategory      TEXT          NOT NULL DEFAULT '',
      original_text    TEXT          NOT NULL,
      source           VARCHAR(20)   NOT NULL DEFAULT 'manual',
      date             TIMESTAMPTZ   NOT NULL DEFAULT now(),
      created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
      CONSTRAINT expenses_amount_positive        CHECK (amount > 0),
      CONSTRAINT expenses_transaction_type_valid CHECK (transaction_type IN ('expense', 'income', 'transfer')),
      -- Only transfers have a destination, and it must differ from the source.
      CONSTRAINT expenses_transfer_destination   CHECK ((transaction_type = 'transfer') = (to_account_id IS NOT NULL)),
      CONSTRAINT expenses_transfer_distinct      CHECK (to_account_id IS NULL OR to_account_id <> account_id)
    );
    CREATE INDEX expenses_date_idx          ON expenses (date DESC);
    CREATE INDEX expenses_account_id_idx    ON expenses (account_id);
    CREATE INDEX expenses_to_account_id_idx ON expenses (to_account_id) WHERE to_account_id IS NOT NULL;
    CREATE INDEX expenses_category_id_idx   ON expenses (category_id);

    CREATE TABLE telegram_raw_messages (
      id           SERIAL      PRIMARY KEY,
      chat_id      BIGINT      NOT NULL,
      message_type VARCHAR(20) NOT NULL,
      raw_text     TEXT        NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX telegram_raw_messages_chat_id_idx ON telegram_raw_messages (chat_id);
  `);
}
