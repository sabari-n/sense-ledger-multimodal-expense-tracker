import { Ollama } from 'ollama';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import { VALIDATION_ERROR, AGENT_BUSY, AGENT_TIMEOUT, AGENT_UNAVAILABLE } from '../errors/errorCodes.js';
import {
  agentRequestsTotal,
  agentRequestDuration,
  agentSteps,
  llmInferenceDuration,
  llmRequestsTotal,
  llmTokensGenerated,
  llmPromptTokens,
} from '../config/metrics.js';
import { TOOL_DEFINITIONS, runTool as defaultRunTool } from './tools/index.js';
import { buildSystemPrompt, UNGROUNDED_ANSWER, UNVERIFIED_ANSWER, NO_ANSWER, GROUNDING_NUDGE, amountNudge } from './prompt.js';

/*
 * The agent loop.
 *
 *   messages = [system, ...history, user question]
 *   repeat (at most maxSteps LLM calls):
 *     reply = LLM(messages, tools)
 *     no tool calls?  → reply is the answer, stop
 *     otherwise       → run each tool, append its result as a `tool` message, go again
 *
 * The model decides which tools to call and in what order; multi-step questions
 * ("October vs September") take several calls before it can answer. The last allowed
 * call is made without tools, which forces an answer from what has been gathered.
 *
 * Guardrails around the model:
 * - inputs are bounded (question length, history size, client-supplied roles)
 * - a hard step limit, a wall-clock timeout and a concurrency cap (Ollama is one process)
 * - grounding: an answer given before any successful tool call gets one reminder to look
 *   the data up; if it then states numbers or facts about the data with no lookup behind
 *   them, it is replaced with a refusal, so made-up amounts never reach the user
 */

export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 2000;
const NUM_CTX = 8192; // tool schemas + results don't fit Ollama's small default context

let active = 0;

/** Keep only plain user/assistant turns from the client — never system or tool messages. */
export function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_HISTORY_CHARS) }));
}

const MAX_CONTEXT_QUESTIONS = 3;

/**
 * Follow-ups ("and in September?") need the earlier questions, but not the earlier answers:
 * given answers with amounts in them, models copy or tweak those numbers instead of calling
 * tools (qwen2.5 invented "₹3,500" for September this way). So the model gets one standalone
 * user message — earlier questions as context plus the current one — and must look up again.
 */
export function withContext(question, history) {
  const earlier = history.filter((m) => m.role === 'user').slice(-MAX_CONTEXT_QUESTIONS).map((m) => m.content);
  if (earlier.length === 0) return question;
  return 'Earlier questions in this conversation, only to understand what the current question refers to:\n' +
    earlier.map((q) => `- ${q}`).join('\n') +
    `\n\nCurrent question: ${question}`;
}

/**
 * True when the answer states something about the data: any number (amount, count, date), or
 * a claim like "no transactions" / "you spent". Without a successful lookup that's made up.
 */
export const statesLedgerFacts = (text) =>
  /\d|\bno (matching |recorded )?(transactions|expenses|spending)\b|\byou (spent|earned|received|paid)\b/i.test(text);

const round2 = (n) => Math.round(n * 100) / 100;

/** Every number anywhere in the successful tool results (absolute values, 2 decimals). */
function resultNumbers(steps) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.add(round2(Math.abs(v)));
    else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) out.add(round2(Math.abs(Number(v))));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  steps.filter((s) => s.ok).forEach((s) => walk(s.result));
  return [...out];
}

/** Currency amounts the answer states, e.g. "₹1,234.50", "-₹4,100", "Rs 500" → [1234.5, 4100, 500]. */
export function statedAmounts(text, symbol = env.defaults.currencySymbol) {
  const sym = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:${sym}|\\bRs\\.?|\\bINR)\\s?-?\\s?(\\d[\\d,]*(?:\\.\\d+)?)`, 'gi');
  return [...text.matchAll(re)].map((m) => Number(m[1].replace(/,/g, ''))).filter(Number.isFinite);
}

/**
 * Amounts in the answer that no tool result supports. Supported = a number from a result, or
 * the sum, difference or ratio of two (comparisons, averages), allowing rounding to the rupee.
 * Catches corrupted or invented figures that a "was a tool called?" check can't: e.g. a tool
 * returned 420183 and the model wrote "₹42,018.30", or a breakdown said 3,440 and it wrote 2,520.
 */
export function unsupportedAmounts(answer, steps) {
  const stated = statedAmounts(answer);
  if (stated.length === 0) return [];
  const nums = resultNumbers(steps);
  const supported = [];
  for (const a of nums) {
    supported.push(a);
    for (const b of nums) {
      supported.push(a + b, Math.abs(a - b));
      if (b) supported.push(a / b);
    }
  }
  return stated.filter((v) => !supported.some((x) => Math.abs(x - v) <= 0.5));
}

function recordLlmMetrics(model, response, seconds) {
  llmInferenceDuration.observe({ model, status: 'success' }, seconds);
  llmRequestsTotal.inc({ model, status: 'success' });
  if (response.eval_count) llmTokensGenerated.inc({ model }, response.eval_count);
  if (response.prompt_eval_count) llmPromptTokens.inc({ model }, response.prompt_eval_count);
}

function toAppError(err, model, timedOut) {
  if (err instanceof AppError) return err;
  if (timedOut) {
    return new AppError('That question took too long to answer. Try a simpler or narrower question.', AGENT_TIMEOUT.status, AGENT_TIMEOUT.code);
  }
  const msg = String(err?.message || err);
  if (/not found|pull/i.test(msg)) {
    return new AppError(`The agent model "${model}" is not available in Ollama. Run: ollama pull ${model}`, AGENT_UNAVAILABLE.status, AGENT_UNAVAILABLE.code);
  }
  if (/does not support tools/i.test(msg)) {
    return new AppError(`The model "${model}" does not support tool calling. Set OLLAMA_AGENT_MODEL to one that does (e.g. qwen2.5:7b).`, AGENT_UNAVAILABLE.status, AGENT_UNAVAILABLE.code);
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    return new AppError('The local LLM (Ollama) is not reachable right now.', AGENT_UNAVAILABLE.status, AGENT_UNAVAILABLE.code);
  }
  return err;
}

/**
 * Run the loop. Pure with respect to its dependencies so tests can drive it with a fake LLM.
 *
 * @param {{ question: string, history: object[], chat: Function, runTool: Function, model: string, maxSteps: number, now: Date }} p
 */
export async function runAgentLoop({ question, history, chat, runTool, model, maxSteps, now }) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(now) },
    { role: 'user', content: withContext(question, history) },
  ];
  const steps = [];
  const seenCalls = new Map(); // identical repeated calls reuse the first result
  let llmCalls = 0;
  let answer = null;
  let nudged = false;
  let amountNudged = false;

  while (llmCalls < maxSteps) {
    const lastChance = llmCalls === maxSteps - 1;
    const started = process.hrtime.bigint();
    const response = await chat({
      model,
      messages,
      ...(lastChance ? {} : { tools: TOOL_DEFINITIONS }),
      options: { temperature: 0, num_ctx: NUM_CTX },
    });
    llmCalls += 1;
    recordLlmMetrics(model, response, Number(process.hrtime.bigint() - started) / 1e9);

    const message = response.message || {};
    const toolCalls = lastChance ? [] : (message.tool_calls || []);
    messages.push({ role: 'assistant', content: message.content || '', ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });

    if (toolCalls.length === 0) {
      const reply = (message.content || '').trim();
      // Self-correction: an answer with no lookup behind it gets one reminder and another try.
      // (Out-of-scope questions cost one extra short call; the model then just declines again.)
      if (!nudged && !lastChance && !steps.some((s) => s.ok)) {
        nudged = true;
        messages.push({ role: 'user', content: GROUNDING_NUDGE });
        continue;
      }
      // Fact check: every ₹ amount must come from a tool result. One reminder, then it's blocked.
      const bad = steps.some((s) => s.ok) ? unsupportedAmounts(reply, steps) : [];
      if (bad.length && !amountNudged && !lastChance) {
        amountNudged = true;
        messages.push({ role: 'user', content: amountNudge(bad) });
        continue;
      }
      answer = reply;
      break;
    }
    for (const call of toolCalls) {
      const name = call.function?.name;
      const args = call.function?.arguments ?? {};
      const key = `${name}:${JSON.stringify(args)}`;
      const t0 = Date.now();

      let outcome = seenCalls.get(key);
      if (!outcome) {
        console.log('name, args',name, args)
        outcome = await runTool(name, args);
        seenCalls.set(key, outcome);
      }
      steps.push({
        tool: name,
        arguments: args,
        ok: outcome.ok,
        ...(outcome.ok ? { result: outcome.result } : { error: outcome.error }),
        duration_ms: Date.now() - t0,
      });
      messages.push({ role: 'tool', tool_name: name, content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }) });
    }
  }

  const grounded = steps.some((s) => s.ok);
  let outcome;
  if (!answer) {
    outcome = 'step_limit';
    answer = NO_ANSWER;
  } else if (!grounded && statesLedgerFacts(answer)) {
    outcome = 'ungrounded';
    answer = UNGROUNDED_ANSWER;
  } else if (grounded && unsupportedAmounts(answer, steps).length) {
    outcome = 'ungrounded';
    answer = UNVERIFIED_ANSWER;
  } else {
    outcome = grounded ? 'answered' : 'declined';
  }

  return { answer, outcome, steps, llm_calls: llmCalls };
}

/**
 * Answer a natural-language question about the ledger.
 *
 * @param {{ question: string, history?: {role:'user'|'assistant', content:string}[], channel?: 'api'|'telegram'|'cli' }} input
 * @param {{ chat?: Function, runTool?: Function, now?: Date }} [deps]  Injected in tests.
 * @returns {Promise<{ answer: string, outcome: string, steps: object[], llm_calls: number, model: string, duration_ms: number }>}
 */
export async function askLedger({ question, history = [], channel = 'api' }, deps = {}) {
  const text = typeof question === 'string' ? question.trim() : '';
  if (!text) throw new AppError('question is required', VALIDATION_ERROR.status, VALIDATION_ERROR.code);
  if (text.length > MAX_QUESTION_CHARS) {
    throw new AppError(`question must be at most ${MAX_QUESTION_CHARS} characters`, VALIDATION_ERROR.status, VALIDATION_ERROR.code);
  }

  const { model, maxSteps, timeoutMs, maxConcurrent } = env.agent;
  if (active >= maxConcurrent) {
    agentRequestsTotal.inc({ channel, outcome: 'busy' });
    throw new AppError("I'm answering other questions right now. Please try again in a moment.", AGENT_BUSY.status, AGENT_BUSY.code);
  }

  active += 1;
  const started = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  // One client per question so the timeout aborts only this question's HTTP calls.
  const chat = deps.chat || ((req) => new Ollama({
    host: env.ollama.host,
    fetch: (url, init) => fetch(url, { ...init, signal: controller.signal }),
  }).chat(req));

  let outcome = 'error';
  try {
    const result = await runAgentLoop({
      question: text,
      history: sanitizeHistory(history),
      chat,
      runTool: deps.runTool || defaultRunTool,
      model,
      maxSteps,
      now: deps.now || new Date(),
    });
    outcome = result.outcome;
    agentSteps.observe(result.llm_calls);
    const duration_ms = Date.now() - started;
    logger.info(`[Agent] ${channel}: ${outcome} in ${duration_ms}ms, ${result.llm_calls} LLM call(s), tools: ${result.steps.map((s) => `${s.tool}${s.ok ? '' : '✗'}`).join(', ') || 'none'}`);
    return { ...result, model, duration_ms };
  } catch (err) {
    const appErr = toAppError(err, model, timedOut);
    outcome = appErr.code === AGENT_TIMEOUT.code ? 'timeout' : 'error';
    if (!(appErr instanceof AppError)) logger.error('[Agent] Unexpected failure:', err);
    throw appErr;
  } finally {
    clearTimeout(timer);
    active -= 1;
    agentRequestsTotal.inc({ channel, outcome });
    agentRequestDuration.observe({ channel, outcome }, (Date.now() - started) / 1000);
  }
}
