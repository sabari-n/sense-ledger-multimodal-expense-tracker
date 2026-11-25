# Ask your ledger: the SenseLedger agent

Users ask questions about their money in plain language, in the web UI (**Ask Ledger**) or in Telegram. A local LLM decides which tools to call, the tools read the ledger, and the LLM answers from the results.

- *"How much did I spend on food in October compared with September?"*
- *"Which account is running low?"*
- *"What were my 5 biggest expenses last month?"*

Questions the ledger can't answer (budgets, investment advice, anything off-topic) are declined.

## How a question flows

```
Web UI ──POST /api/agent/ask──┐
Telegram (/ask or a question) ┴─▶ askLedger()  (server/src/agent/agent.service.js)
                                     │
                                     ▼
                     ┌──────── agent loop (≤ AGENT_MAX_STEPS LLM calls) ────────┐
                     │ Ollama chat(messages, tools)                             │
                     │   ├─ tool calls? → runTool() → append results → repeat  │
                     │   └─ no tool calls → answer                             │
                     └──────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                     grounding check → { answer, outcome, steps }
```

Telegram text messages that end in `?` or start like a question (*how, what, which, did, show…*) go to the agent. Everything else still goes through the Kafka extraction pipeline as a new transaction.

## Tools (`server/src/agent/tools/`, one file per tool)

Each tool is one file exporting `defineTool({ name, description, schema, run })`; the contract is checked at startup. Tools don't import the database, repositories or config: `run(args, ctx)` gets them from a tool context (`tools/common/context.js`), so each tool is unit-tested with a fake context, which checks the SQL it builds and the values it binds, without Postgres.

| Tool | Use |
|---|---|
| `get_balances({ account? })` | Balance per account, lowest first, plus net balance |
| `list_categories()` | Valid category, subcategory and account names |
| `sum_transactions({ period, filters, group_by? })` | Totals; `group_by` = category, subcategory, account or month |
| `list_transactions({ period, filters, sort?, limit? })` | Individual rows, newest or largest first (max 20) |

**Period:** exactly one of `period` (`this_month`, `last_month`, `this_year`, `last_year`, `today`, `last_7_days`, `last_30_days`), `month` (`YYYY-MM`), `year` (`YYYY`), or `start_date` with an optional `end_date`. A `start_date` on its own runs to today, which is how "since July" is expressed. Small models choose a named period far more reliably than they work out date ranges.

**Filters:** `transaction_type` (defaults to `expense`), `category`, `subcategory`, `account`.

Balance adjustments and opening balances are never counted as spending or income.

### Safe text-to-SQL

The model never writes SQL. It only fills in arguments, and the tools turn those into a fixed query:

1. **Validated:** Zod schemas, strict, so unknown arguments are rejected rather than silently ignored.
2. **Resolved:** names are matched against the real accounts and categories, and periods become concrete dates in `APP_TIMEZONE`.
3. **Bound:** every value is a query parameter. `GROUP BY` and `ORDER BY` come from a whitelist.
4. **Read-only, in three layers** (`server/src/agent/db.js`). A write would have to get past all three:
   - **App:** the agent's Sequelize instance is private. Code only gets `readOnlyDb.query()`, which accepts a single `SELECT`/`WITH` statement with no write or DDL keywords and nothing after a `;`.
   - **Session:** every pooled connection runs `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` when it connects.
   - **Database:** queries run as the `ledger_agent` role, which can only `SELECT` from `accounts`, `categories` and `expenses`. Each statement has a 5 s timeout (migration `002_agent_readonly_role`).

When an argument is bad, the tool returns `{ ok: false, error }` with instructions on how to fix it, and the model retries. You can see this in the trace when a step shows as "retried".

## Guardrails (`server/src/agent/agent.service.js`)

| Risk | Guard |
|---|---|
| Made-up numbers | If the model answers before any successful lookup, it is reminded once to use the tools. If it still states numbers or claims about the data with no lookup behind them, the answer is replaced with a refusal (`outcome: ungrounded`). |
| Wrong or corrupted amounts | Every ₹ amount in the answer must match a figure in a tool result, or a sum, difference or ratio of two (comparisons, averages), give or take ₹0.50 for rounding. A mismatch gets one reminder ("₹X does not match any tool result…"); if it still doesn't match, the answer is blocked (`outcome: ungrounded`). This caught a model writing ₹42,018.30 for a tool result of 420183. |
| Copying numbers from earlier answers | Follow-ups get only the earlier **questions** as context, never the earlier answers. |
| Endless loops | At most `AGENT_MAX_STEPS` LLM calls. The last call is made without tools, which forces an answer. Identical repeated tool calls reuse the first result. |
| Slow model / overload | `AGENT_TIMEOUT_MS` aborts the Ollama call (HTTP 504). `AGENT_MAX_CONCURRENT` caps parallel questions (HTTP 429). |
| Prompt injection via history | The client may only send `user` and `assistant` messages, with limited length and count. The system prompt is always built on the server. |
| Prompt injection via data | Tool results label transaction descriptions as data, not instructions. The tools can't write anything in any case. |
| Strangers using the Telegram bot | `TELEGRAM_ALLOWED_CHAT_IDS` restricts the whole bot, both recording and asking. |

## Configuration

| Variable | Default | |
|---|---|---|
| `OLLAMA_AGENT_MODEL` | `qwen2.5:7b` | Must support tool calling in Ollama. `gemma3` does not. `llama3.1:8b` also works. |
| `DB_AGENT_PASSWORD` | `ledger_agent_password` | **Change in production.** Applied to the role on every startup. |
| `APP_TIMEZONE` | `Asia/Kolkata` | Defines "today" and month boundaries. The database stores UTC. |
| `AGENT_MAX_STEPS` | `6` | |
| `AGENT_TIMEOUT_MS` | `90000` | nginx allows 120 s for `/api/agent/`. |
| `AGENT_MAX_CONCURRENT` | `2` | |
| `TELEGRAM_ALLOWED_CHAT_IDS` | *(empty = anyone)* | Comma-separated. |

The migration creates a Postgres role, so the database user that runs migrations needs `CREATEROLE`. The Docker Postgres user has it. On a managed database, grant it or create the role yourself.

## API

`POST /api/agent/ask`

```json
{ "question": "And in September?",
  "history": [{ "role": "user", "content": "How much did I spend on food in October?" },
              { "role": "assistant", "content": "You spent ₹4,000 on food in October." }] }
```

```json
{ "success": true, "data": {
  "answer": "You spent ₹3,000 on food in September.",
  "outcome": "answered",
  "steps": [{ "tool": "sum_transactions", "arguments": { "month": "2026-09", "category": "Food" },
              "ok": true, "result": { "total": 3000, "...": "..." }, "duration_ms": 6 }],
  "llm_calls": 2, "model": "qwen2.5:7b", "duration_ms": 1840 } }
```

`outcome` is one of `answered`, `declined` (out of scope), `ungrounded` (an answer with nothing looked up was blocked) or `step_limit`.

## Metrics

| Metric | Labels |
|---|---|
| `agent_requests_total` | `channel` (api, telegram, cli), `outcome` (also `busy`, `timeout`, `error`) |
| `agent_request_duration_seconds` | `channel`, `outcome` |
| `agent_steps` | LLM calls per question |
| `agent_tool_calls_total` | `tool`, `status` (ok, invalid = the model sent bad arguments, error) |

The existing `llm_*` metrics include the agent's calls, labelled with the agent model. A rising `ungrounded` or `invalid` rate means the model or prompt needs attention.

## Developing

```bash
cd server
npm test                                              # unit tests: tools, dates, agent loop (fake LLM), routing
npm run ask -- "Which account is running low?"        # real model + DB, prints every tool call
```
