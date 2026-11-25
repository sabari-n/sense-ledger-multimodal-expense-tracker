/**
 * Dependency-free enums shared by models, migrations-aware code and services.
 * (utils/constants.js imports repositories, so models must not import from it.)
 */

/** Kinds of ledger entry. Also enforced by a CHECK constraint on expenses.transaction_type. */
export const TRANSACTION_TYPES = Object.freeze({
  EXPENSE: 'expense',
  INCOME: 'income',
  TRANSFER: 'transfer',
});

/**
 * Where a ledger entry came from. Validated in the app (not the DB) so a new channel —
 * e.g. 'sms' or 'bank_import' — only needs a new value here.
 */
export const TRANSACTION_SOURCES = Object.freeze({
  MANUAL: 'manual',          // web UI form / transfer
  VOICE: 'voice',            // web UI audio upload
  TELEGRAM: 'telegram',      // Telegram bot (text, voice, photo)
  ADJUSTMENT: 'adjustment',  // balance edits and opening balances
  SAMPLE: 'sample',          // generated demo data (npm run seed:sample) — removable as a set
});
