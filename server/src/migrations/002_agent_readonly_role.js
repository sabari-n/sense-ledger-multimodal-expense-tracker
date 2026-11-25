/**
 * Read-only role for the "ask your ledger" agent.
 *
 * The agent's tools connect as `ledger_agent`, which can only SELECT from the three ledger
 * tables. Even a bug in a tool (or a prompt-injected argument that slips past validation)
 * cannot modify data or read anything else (e.g. telegram_raw_messages).
 *
 * The role is created without LOGIN here; its password comes from DB_AGENT_PASSWORD and is
 * (re)applied on every startup by agent/db.js#enableAgentLogin, so rotating it needs no migration.
 *
 * Needs the migrating user to have CREATEROLE (the Docker Postgres superuser does).
 */
export async function up({ query }) {
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_agent') THEN
        CREATE ROLE ledger_agent NOLOGIN;
      END IF;
      EXECUTE format('GRANT CONNECT ON DATABASE %I TO ledger_agent', current_database());
    END
    $$;

    GRANT USAGE ON SCHEMA public TO ledger_agent;
    GRANT SELECT ON accounts, categories, expenses TO ledger_agent;

    -- Defence in depth: every transaction is read-only and no query can run away.
    ALTER ROLE ledger_agent SET default_transaction_read_only = on;
    ALTER ROLE ledger_agent SET statement_timeout = '5s';
    ALTER ROLE ledger_agent CONNECTION LIMIT 5;
  `);
}
