import { z } from 'zod';
import { logger } from '../../config/logger.js';
import { agentToolCallsTotal } from '../../config/metrics.js';
import { ToolInputError } from './common/errors.js';
import { cleanArgs, formatZodError } from './common/args.js';
import { createToolContext } from './common/context.js';
import { getBalances } from './get-balances.js';
import { listCategories } from './list-categories.js';
import { sumTransactions } from './sum-transactions.js';
import { listTransactions } from './list-transactions.js';

/*
 * The agent's tools: the only way the LLM can see ledger data.
 *
 *   tools/
 *     index.js              ← you are here: the registry and runTool()
 *     get-balances.js       one file per tool: name, description, argument schema, run()
 *     list-categories.js
 *     sum-transactions.js
 *     list-transactions.js
 *     common/
 *       define-tool.js      the tool contract, checked at startup
 *       context.js          the dependencies passed to run(args, ctx): read-only DB, lookups, today
 *       args.js             shared argument schemas, clean-up of model arguments, error text
 *       filters.js          names → ids, periods → dates
 *       sql.js              shared FROM / WHERE pieces and their placeholder values
 *       format.js           money rounding
 *       errors.js           ToolInputError
 *
 * This is "safe text-to-SQL": the model never writes SQL. It fills in typed arguments, which
 * are validated with Zod, matched against the real account/category names, and placed into
 * fixed SQL through placeholders. Anything else (GROUP BY / ORDER BY) comes from a whitelist.
 * Queries run as the read-only `ledger_agent` role (agent/db.js).
 *
 * Tools don't import the database, repositories or config: everything they use arrives in
 * `ctx` (common/context.js). That keeps each tool testable with a fake context.
 *
 * To add a tool: create a file exporting defineTool({ name, description, schema, run }) and add
 * it to TOOLS.
 */

/** Order matters only for how the tools are listed to the model. */
const TOOLS = [getBalances, listCategories, sumTransactions, listTransactions];
const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export const TOOL_NAMES = TOOLS.map((tool) => tool.name);

function toParameters(schema) {
  const { $schema, ...json } = z.toJSONSchema(schema, { io: 'input' });
  return json;
}

/** Tool definitions in the shape Ollama's chat API expects. */
export const TOOL_DEFINITIONS = TOOLS.map((tool) => ({
  type: 'function',
  function: { name: tool.name, description: tool.description, parameters: toParameters(tool.schema) },
}));

/**
 * Validate and run one tool call. Never throws: the outcome is always something the
 * model can read.
 *
 * @param {string} name
 * @param {unknown} rawArgs  the model's arguments, as sent
 * @param {import('./common/context.js').ToolContext} [ctx]  real dependencies by default; tests pass fakes
 * @returns {Promise<{ ok: true, result: object } | { ok: false, error: string }>}
 */
export async function runTool(name, rawArgs, ctx = createToolContext()) {
  const tool = BY_NAME.get(name);
  if (!tool) {
    agentToolCallsTotal.inc({ tool: 'unknown', status: 'invalid' });
    return { ok: false, error: `Unknown tool "${name}". Available tools: ${TOOL_NAMES.join(', ')}.` };
  }

  try {
    const parsed = tool.schema.safeParse(cleanArgs(rawArgs));
    if (!parsed.success) throw new ToolInputError(formatZodError(parsed.error, tool.schema));
    const result = await tool.run(parsed.data, ctx);
    agentToolCallsTotal.inc({ tool: name, status: 'ok' });
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ToolInputError) {
      agentToolCallsTotal.inc({ tool: name, status: 'invalid' });
      return { ok: false, error: err.message };
    }
    agentToolCallsTotal.inc({ tool: name, status: 'error' });
    logger.error(`[Agent] Tool ${name} failed:`, err);
    return { ok: false, error: 'The tool failed because of an internal error. Tell the user the data is unavailable right now.' };
  }
}

// Shared helpers re-exported for tests and other callers.
export { ToolInputError } from './common/errors.js';
export { cleanArgs } from './common/args.js';
export { createToolContext } from './common/context.js';
export { defineTool } from './common/define-tool.js';
export { resolveFilters, periodRange } from './common/filters.js';
