/**
 * Normalize the schema:
 *
 * expenses
 *   - account / to_account / category (names) → account_id / to_account_id / category_id (FKs)
 *   - NUMERIC(14,2) amounts, NOT NULL date/type/subcategory, created_at / updated_at
 *   - `source` column (manual | voice | telegram | adjustment | unknown)
 *   - CHECK constraints for type, positive amount and transfer shape; indexes for lookups
 *
 * accounts
 *   - `balance` is dropped: balances are derived from transactions (the ledger is the single
 *     source of truth). Any stored balance not backed by transactions is first recorded as a
 *     "Balance adjustment" entry, so every account keeps exactly the balance it showed.
 *   - NOT NULL flags, updated_at, at most one default account, case-insensitive unique names
 *
 * categories
 *   - NOT NULL fields, valid transaction_type, updated_at, case-insensitive unique names
 *
 * Legacy rows that would violate the new constraints are repaired in a way that keeps
 * every account balance unchanged (see "Repair legacy rows").
 */
export async function up({ query }) {
  // ─── Normalize categories / accounts ─────────────────────────────────────────
  await query(`
    UPDATE categories SET transaction_type = lower(trim(COALESCE(transaction_type, 'expense')));
    UPDATE categories SET transaction_type = 'expense'
      WHERE transaction_type NOT IN ('expense', 'income', 'transfer');

    -- Exactly one default account (the flagged one, else the oldest).
    UPDATE accounts SET is_default = (id = (
      SELECT id FROM accounts ORDER BY is_default DESC NULLS LAST, created_at, id LIMIT 1
    ));
  `);

  // ─── Repair legacy expense rows ──────────────────────────────────────────────
  await query(`
    ALTER TABLE expenses ADD COLUMN source VARCHAR(20);
    UPDATE expenses SET source = CASE
      WHEN original_text IN ('Balance adjustment', 'Opening balance') THEN 'adjustment'
      ELSE 'unknown' END;

    UPDATE expenses SET transaction_type = lower(trim(COALESCE(transaction_type, 'expense')));
    UPDATE expenses SET transaction_type = 'expense'
      WHERE transaction_type NOT IN ('expense', 'income', 'transfer');

    UPDATE expenses SET account = (SELECT name FROM accounts WHERE is_default LIMIT 1)
      WHERE account IS NULL;

    -- Rows pointing at names that no longer exist (only possible without the old FKs).
    INSERT INTO accounts (name, created_at)
      SELECT DISTINCT n, now() FROM (
        SELECT account AS n FROM expenses UNION SELECT to_account FROM expenses
      ) refs
      WHERE n IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.name = refs.n)
      ON CONFLICT DO NOTHING;
    INSERT INTO categories (name, transaction_type, created_at)
      SELECT category, min(transaction_type), now() FROM expenses e
      WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = e.category)
      GROUP BY category
      ON CONFLICT DO NOTHING;

    -- Only transfers have a destination.
    UPDATE expenses SET to_account = NULL WHERE transaction_type <> 'transfer';
    -- A transfer without a destination only ever debited its source: same as an expense.
    UPDATE expenses SET transaction_type = 'expense' WHERE transaction_type = 'transfer' AND to_account IS NULL;
    -- Self-transfers and zero amounts never moved any balance.
    DELETE FROM expenses WHERE transaction_type = 'transfer' AND to_account = account;
    DELETE FROM expenses WHERE amount = 0;
    -- Negative amounts: flip direction so the balance effect is identical.
    UPDATE expenses SET amount = -amount,
      transaction_type = CASE transaction_type WHEN 'income' THEN 'expense' WHEN 'expense' THEN 'income' ELSE transaction_type END,
      account    = CASE WHEN transaction_type = 'transfer' THEN to_account ELSE account END,
      to_account = CASE WHEN transaction_type = 'transfer' THEN account ELSE to_account END
      WHERE amount < 0;

    UPDATE expenses SET date = now() WHERE date IS NULL;
    UPDATE expenses SET subcategory = '' WHERE subcategory IS NULL;
  `);

  // ─── Record stored balances not backed by transactions ──────────────────────
  await query(`
    -- Fallback categories for adjustment rows. Only needed on an existing database: a fresh
    -- one has no accounts yet, and the seed step creates these with their configured fields.
    INSERT INTO categories (name, transaction_type, emoji, is_system, created_at)
    SELECT v.name, v.type, v.emoji, true, now()
    FROM (VALUES ('Other Income', 'income', '💰'), ('Other', 'expense', '📋')) AS v(name, type, emoji)
    WHERE EXISTS (SELECT 1 FROM accounts)
    ON CONFLICT (name) DO NOTHING;

    WITH ledger AS (
      SELECT a.name,
             round(COALESCE(a.balance, 0) - COALESCE(SUM(
               CASE WHEN e.account = a.name AND e.transaction_type = 'income' THEN e.amount
                    WHEN e.account = a.name THEN -e.amount
                    WHEN e.to_account = a.name THEN e.amount
                    ELSE 0 END), 0), 2) AS gap
      FROM accounts a
      LEFT JOIN expenses e ON e.account = a.name OR e.to_account = a.name
      GROUP BY a.name, a.balance
    )
    INSERT INTO expenses (original_text, amount, category, subcategory, transaction_type, account, date, source)
    SELECT 'Balance adjustment', abs(gap),
           CASE WHEN gap > 0 THEN 'Other Income' ELSE 'Other' END, '',
           CASE WHEN gap > 0 THEN 'income' ELSE 'expense' END,
           name, now(), 'adjustment'
    FROM ledger WHERE gap <> 0;
  `);

  // ─── Names → foreign keys ────────────────────────────────────────────────────
  await query(`
    ALTER TABLE expenses
      ADD COLUMN account_id    INTEGER,
      ADD COLUMN to_account_id INTEGER,
      ADD COLUMN category_id   INTEGER;

    UPDATE expenses e SET account_id    = a.id FROM accounts a   WHERE a.name = e.account;
    UPDATE expenses e SET to_account_id = a.id FROM accounts a   WHERE a.name = e.to_account;
    UPDATE expenses e SET category_id   = c.id FROM categories c WHERE c.name = e.category;

    -- Dropping the name columns also drops the old name-based FKs.
    ALTER TABLE expenses
      DROP COLUMN account,
      DROP COLUMN to_account,
      DROP COLUMN category;

    ALTER TABLE expenses
      ALTER COLUMN account_id  SET NOT NULL,
      ALTER COLUMN category_id SET NOT NULL,
      ADD CONSTRAINT expenses_account_id_fkey    FOREIGN KEY (account_id)    REFERENCES accounts(id)   ON DELETE RESTRICT,
      ADD CONSTRAINT expenses_to_account_id_fkey FOREIGN KEY (to_account_id) REFERENCES accounts(id)   ON DELETE RESTRICT,
      ADD CONSTRAINT expenses_category_id_fkey   FOREIGN KEY (category_id)   REFERENCES categories(id) ON DELETE RESTRICT;
  `);

  // ─── expenses: types, defaults, constraints, indexes ────────────────────────
  await query(`
    ALTER TABLE expenses
      ALTER COLUMN amount           TYPE NUMERIC(14,2) USING round(amount, 2),
      ALTER COLUMN transaction_type TYPE VARCHAR(20),
      ALTER COLUMN transaction_type SET DEFAULT 'expense',
      ALTER COLUMN transaction_type SET NOT NULL,
      ALTER COLUMN subcategory      SET DEFAULT '',
      ALTER COLUMN subcategory      SET NOT NULL,
      ALTER COLUMN date             SET DEFAULT now(),
      ALTER COLUMN date             SET NOT NULL,
      ALTER COLUMN source           SET DEFAULT 'manual',
      ALTER COLUMN source           SET NOT NULL,
      ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

    -- Best available creation time for existing rows is their transaction date.
    UPDATE expenses SET created_at = date, updated_at = date;

    ALTER TABLE expenses
      ADD CONSTRAINT expenses_amount_positive        CHECK (amount > 0),
      ADD CONSTRAINT expenses_transaction_type_valid CHECK (transaction_type IN ('expense', 'income', 'transfer')),
      ADD CONSTRAINT expenses_transfer_destination   CHECK ((transaction_type = 'transfer') = (to_account_id IS NOT NULL)),
      ADD CONSTRAINT expenses_transfer_distinct      CHECK (to_account_id IS NULL OR to_account_id <> account_id);

    CREATE INDEX expenses_date_idx          ON expenses (date DESC);
    CREATE INDEX expenses_account_id_idx    ON expenses (account_id);
    CREATE INDEX expenses_to_account_id_idx ON expenses (to_account_id) WHERE to_account_id IS NOT NULL;
    CREATE INDEX expenses_category_id_idx   ON expenses (category_id);
  `);

  // ─── accounts ────────────────────────────────────────────────────────────────
  await query(`
    UPDATE accounts SET
      account_type     = COALESCE(account_type, 'general'),
      icon             = COALESCE(icon, 'fa-wallet'),
      color            = COALESCE(color, '#3b82f6'),
      is_default       = COALESCE(is_default, false),
      include_in_total = COALESCE(include_in_total, true);

    ALTER TABLE accounts
      DROP COLUMN balance,
      ALTER COLUMN account_type     SET NOT NULL,
      ALTER COLUMN icon             SET NOT NULL,
      ALTER COLUMN color            SET NOT NULL,
      ALTER COLUMN is_default       SET NOT NULL,
      ALTER COLUMN include_in_total SET NOT NULL,
      ALTER COLUMN created_at       SET DEFAULT now(),
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

    CREATE UNIQUE INDEX accounts_single_default ON accounts (is_default) WHERE is_default;
    CREATE UNIQUE INDEX accounts_name_lower_key ON accounts (lower(name));
  `);

  // ─── categories ──────────────────────────────────────────────────────────────
  await query(`
    UPDATE categories SET
      emoji         = COALESCE(emoji, '📋'),
      subcategories = COALESCE(subcategories, '[]'::jsonb),
      is_system     = COALESCE(is_system, false),
      sort_order    = COALESCE(sort_order, 99);

    ALTER TABLE categories
      ALTER COLUMN emoji            SET NOT NULL,
      ALTER COLUMN transaction_type SET NOT NULL,
      ALTER COLUMN subcategories    SET NOT NULL,
      ALTER COLUMN is_system        SET NOT NULL,
      ALTER COLUMN sort_order       SET NOT NULL,
      ALTER COLUMN created_at       SET DEFAULT now(),
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ADD CONSTRAINT categories_transaction_type_valid CHECK (transaction_type IN ('expense', 'income', 'transfer'));

    CREATE UNIQUE INDEX categories_name_lower_key ON categories (lower(name));
  `);

  // ─── telegram_raw_messages ───────────────────────────────────────────────────
  await query(`
    ALTER TABLE telegram_raw_messages ALTER COLUMN created_at SET DEFAULT now();
    CREATE INDEX IF NOT EXISTS telegram_raw_messages_chat_id_idx ON telegram_raw_messages (chat_id);
  `);
}
