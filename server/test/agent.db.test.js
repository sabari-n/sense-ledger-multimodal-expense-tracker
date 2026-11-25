import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertReadOnlySql, readOnlyDb } from '../src/agent/db.js';

// The app-level layer of the agent's read-only access. Rejections happen before any
// connection is opened, so no database is needed.

test('single SELECT / WITH statements are allowed', () => {
  for (const sql of [
    'SELECT 1',
    '  select a.id, a.updated_at FROM accounts a WHERE a.id = :id;',
    'WITH t AS (SELECT 1 AS n) SELECT n FROM t',
    "SELECT to_char(e.date AT TIME ZONE :tz, 'YYYY-MM') FROM expenses e ORDER BY 1 DESC",
  ]) assert.doesNotThrow(() => assertReadOnlySql(sql), sql);
});

test('writes, DDL, session changes and stacked statements are rejected', () => {
  for (const sql of [
    "INSERT INTO accounts(name) VALUES ('x')",
    'UPDATE accounts SET name = name',
    'DELETE FROM expenses',
    'WITH gone AS (DELETE FROM expenses RETURNING *) SELECT count(*) FROM gone',
    'SELECT * INTO backup FROM expenses',
    'SELECT 1; DROP TABLE expenses',
    'SET default_transaction_read_only = off',
    'TRUNCATE expenses',
    'COPY expenses TO STDOUT',
    'CREATE TABLE x (id int)',
    'ALTER ROLE ledger_agent SUPERUSER',
    'SELECT 1 FOR UPDATE',
    '',
  ]) assert.throws(() => assertReadOnlySql(sql), /read-only|must be a string/, sql);
  assert.throws(() => assertReadOnlySql(null), /must be a string/);
});

test('the read-only handle exposes nothing but query and cannot be modified', async () => {
  assert.deepEqual(Object.keys(readOnlyDb), ['query']);
  assert.equal(Object.isFrozen(readOnlyDb), true);
  await assert.rejects(async () => readOnlyDb.query('DELETE FROM expenses'), /read-only/);
});
