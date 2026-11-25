/**
 * Ask the ledger agent from the terminal and see every step of the loop.
 *
 *   npm run ask -- "How much did I spend on food last month?"
 *
 * Uses the same .env as the server (DB on localhost:6033, Ollama on localhost:11434).
 */
import { askLedger } from './agent.service.js';
import { closeAgentDb } from './db.js';
import sequelize from '../models/sequelize.js';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const question = process.argv.slice(2).join(' ').trim();
if (!question) {
  console.error('Usage: npm run ask -- "your question"');
  process.exit(1);
}

try {
  const r = await askLedger({ question, channel: 'cli' });
  console.log(`\n${BOLD}Q:${RESET} ${question}\n`);
  r.steps.forEach((s, i) => {
    console.log(`${s.ok ? GREEN : RED}${i + 1}. ${s.tool}${RESET}(${JSON.stringify(s.arguments)})`);
    console.log(`${DIM}   → ${JSON.stringify(s.ok ? s.result : { error: s.error })}${RESET}`);
  });
  console.log(`\n${BOLD}A:${RESET} ${r.answer}`);
  console.log(`${DIM}${r.outcome} · ${r.model} · ${r.llm_calls} LLM call(s) · ${r.duration_ms}ms${RESET}\n`);
} catch (err) {
  console.error(`${RED}${err.code || 'ERROR'}:${RESET} ${err.message}`);
  process.exitCode = 1;
} finally {
  await Promise.all([closeAgentDb(), sequelize.close()]);
}
