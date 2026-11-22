// LLM model benchmark for SenseLedger.
// Runs inside the expense-api container (run.sh copies it there) so it uses the
// app's real prompt, Ollama connection and post-processing rules.
//
// For each model and each case in cases.json it scores two results:
//   raw   - the model's JSON answer on its own
//   final - after normalizeExtracted(), i.e. what the app would save
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Ollama } from 'ollama';
import { env } from '/app/src/config/env.js';
import { normalizeExtracted } from '/app/src/services/llm.service.js';
import { EXPENSE_PROMPT } from '/app/src/utils/constants.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const models = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');
if (models.length === 0) {
  console.error('Usage: bench.mjs <model> [model...] [--verbose]');
  process.exit(1);
}

const ollama = new Ollama({ host: env.ollama.host });
// Use the exact system prompt the app sends, read from the app source.
const SYSTEM = fs
  .readFileSync('/app/src/services/llm.service.js', 'utf8')
  .match(/role: 'system',\s*content: '([^']*)'/)[1];

const cases = JSON.parse(fs.readFileSync(path.join(DIR, 'cases.json'), 'utf8')).map((c) => ({
  ...c,
  text: c.textFile ? fs.readFileSync(path.join(DIR, c.textFile), 'utf8') : c.text,
}));

const lc = (v) => (v == null ? null : String(v).toLowerCase().trim());
const num = (v) => (v == null || v === '' ? null : Number(String(v).replace(/,/g, '')));

function score(out, exp) {
  const failed = [];
  const amount = num(out?.amount);
  if (exp.amount === null ? amount : amount !== exp.amount) failed.push('amount');
  if (exp.amount !== null) {
    if (lc(out?.transaction_type) !== exp.type) failed.push('type');
    if (exp.category && lc(out?.category) !== lc(exp.category)) failed.push('category');
    if (exp.account && lc(out?.account) !== lc(exp.account)) failed.push('account');
    if (exp.to_account && lc(out?.to_account) !== lc(exp.to_account)) failed.push('to_account');
  }
  return failed;
}

async function ask(model, text) {
  const prompt = await EXPENSE_PROMPT(text);
  const start = Date.now();
  const res = await ollama.chat({
    model,
    format: 'json',
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
  });
  const ms = Date.now() - start;
  let raw = null;
  try { raw = JSON.parse(res.message.content); } catch { /* invalid JSON scores as a miss */ }
  return { ms, raw, final: raw ? normalizeExtracted(structuredClone(raw), text) : {} };
}

const brief = (o) => o && `${o.amount ?? '-'} ${o.transaction_type ?? '-'} ${o.category ?? '-'} ${o.account ?? '-'}${o.to_account ? ' -> ' + o.to_account : ''}`;
const results = { ranAt: new Date().toISOString(), host: env.ollama.host, summary: [], detail: [] };

for (const model of models) {
  console.log(`\n=== ${model}`);
  try {
    await ask(model, 'warm up'); // loads the model into memory; not timed
  } catch (err) {
    console.log(`  skipped: ${err.message} (run: ollama pull ${model})`);
    continue;
  }

  let rawOk = 0, finalOk = 0;
  const times = [];
  for (const c of cases) {
    const r = await ask(model, c.text);
    times.push(r.ms);
    const rawFailed = score(r.raw, c.expect);
    const finalFailed = score(r.final, c.expect);
    if (!rawFailed.length) rawOk++;
    if (!finalFailed.length) finalOk++;
    results.detail.push({ model, case: c.name, ms: r.ms, rawFailed, finalFailed, raw: r.raw, final: r.final });

    const mark = (f) => (f.length ? `miss(${f.join(',')})` : 'ok');
    console.log(`  ${c.name.padEnd(26)} ${String(r.ms).padStart(6)}ms  raw ${mark(rawFailed).padEnd(30)} final ${mark(finalFailed)}`);
    if (verbose) console.log(`      raw:   ${brief(r.raw)}\n      final: ${brief(r.final)}`);
  }

  times.sort((a, b) => a - b);
  results.summary.push({
    model,
    raw: `${rawOk}/${cases.length}`,
    final: `${finalOk}/${cases.length}`,
    median_s: +(times[Math.floor(times.length / 2)] / 1000).toFixed(2),
    max_s: +(times.at(-1) / 1000).toFixed(2),
  });

  // Unload so the next model gets the GPU memory to itself.
  await ollama.generate({ model, prompt: '', keep_alive: 0 }).catch(() => {});
}

console.log('\n=== Summary  (raw = model alone, final = after app rules = what gets saved)');
console.log('  ' + 'model'.padEnd(18) + 'raw'.padEnd(8) + 'final'.padEnd(8) + 'median'.padEnd(9) + 'max');
for (const s of results.summary) {
  console.log('  ' + s.model.padEnd(18) + s.raw.padEnd(8) + s.final.padEnd(8) + `${s.median_s}s`.padEnd(9) + `${s.max_s}s`);
}

fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify(results, null, 2));
process.exit(0);
