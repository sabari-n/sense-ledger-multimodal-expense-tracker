import { Sequelize, QueryTypes } from 'sequelize';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/*
 * The agent's database access: read-only, enforced in three independent layers.
 *
 *   1. App — the Sequelize instance is private. Callers only get `readOnlyDb.query()`, which
 *      accepts a single SELECT/WITH statement and nothing else (assertReadOnlySql).
 *   2. Session — every pooled connection is switched to READ ONLY transactions on connect.
 *   3. Database — the `ledger_agent` role only has SELECT on accounts, categories and
 *      expenses (migrations/002_agent_readonly_role.js).
 *
 * Any one layer is enough to stop a write; a bug has to defeat all three.
 */
export const AGENT_DB_ROLE = 'ledger_agent';

// A single statement that starts as a read…
const STARTS_AS_READ = /^\s*(SELECT|WITH)\b/i;
// …and contains no write/DDL/session keyword (catches e.g. `WITH x AS (DELETE …) SELECT …`).
const WRITE_KEYWORDS = /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|CALL|DO|LOCK|VACUUM|REINDEX|CLUSTER|REFRESH|COMMENT|SET|RESET|LISTEN|NOTIFY|PREPARE|EXECUTE|DISCARD|SECURITY|INTO)\b/i;

/**
 * Throw unless `sql` is one read-only statement. Checked on the SQL template, before
 * replacements are substituted — user/model values are bound parameters, never part of it.
 */
export function assertReadOnlySql(sql) {
  if (typeof sql !== 'string') throw new Error('Agent DB: SQL must be a string.');
  const body = sql.trim().replace(/;\s*$/, '');
  if (!STARTS_AS_READ.test(body) || body.includes(';') || WRITE_KEYWORDS.test(body)) {
    throw new Error('Agent DB is read-only: only a single SELECT statement is allowed.');
  }
}

let connection = null;

function agentDb() {
  if (!connection) {
    connection = new Sequelize(env.db.name, AGENT_DB_ROLE, env.agent.dbPassword, {
      host: env.db.host,
      port: env.db.port,
      dialect: 'postgres',
      logging: false,
      pool: { max: 2, min: 0, idle: 10_000 }, // the API container is memory-limited
      hooks: {
        // Layer 2: read-only for this session, regardless of the role's defaults.
        afterConnect: (conn) => conn.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY'),
      },
    });
  }
  return connection;
}

/**
 * The only handle to the agent's connection. Same `query(sql, options)` signature as
 * Sequelize, so shared repository code (e.g. getAccountTotals) can run on it — but it only
 * reads: the SQL is checked and results always come back as plain SELECT rows.
 */
export const readOnlyDb = Object.freeze({
  async query(sql, options = {}) {
    assertReadOnlySql(sql);
    if (!env.agent.logSql) return agentDb().query(sql, { ...options, type: QueryTypes.SELECT });

    // AGENT_LOG_SQL=true: capture the statement exactly as Sequelize sends it, plus timing.
    let sent = null;
    const rows = await agentDb().query(sql, {
      ...options,
      type: QueryTypes.SELECT,
      benchmark: true,
      logging: (statement, ms) => { sent = { statement, ms }; },
    });
    if (sent) {
      const text = sent.statement.replace(/^Execut(?:ing|ed) \([^)]*\):\s*/, '').replace(/\n\s+/g, '\n  ').trim();
      logger.info(`[Agent SQL] ${sent.ms}ms → ${rows.length} row(s)\n  ${text}`);
    }
    return rows;
  },
});

/** Run a parameterised SELECT as the read-only role. */
export function agentSelect(sql, replacements = {}) {
  return readOnlyDb.query(sql, { replacements });
}

/**
 * Give the role its login password from DB_AGENT_PASSWORD. Called at startup with the
 * main (admin) connection, after migrations, so the password can be rotated via env alone.
 */
export async function enableAgentLogin(adminSequelize) {
  await adminSequelize.query(
    `ALTER ROLE ${AGENT_DB_ROLE} WITH LOGIN PASSWORD ${adminSequelize.escape(env.agent.dbPassword)}`
  );
}

export async function closeAgentDb() {
  if (connection) {
    await connection.close();
    connection = null;
  }
}
