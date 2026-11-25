import { z } from 'zod';

/**
 * The contract every tool satisfies:
 *
 *   {
 *     name:        'snake_case' name the model calls
 *     description: when to use it — the model picks tools from this text
 *     schema:      strict Zod object for its arguments (also becomes the JSON schema the model sees)
 *     run(args, ctx): args are already validated; ctx carries every dependency (see context.js)
 *   }
 *
 * Checked when the module loads, so a malformed tool stops the server at startup instead of
 * failing the first time the model calls it.
 */
export function defineTool(tool) {
  const problems = [];
  if (typeof tool?.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(tool.name)) problems.push('name must be snake_case');
  if (typeof tool?.description !== 'string' || tool.description.trim().length < 20) problems.push('description must explain when to use the tool');
  if (!(tool?.schema instanceof z.ZodObject)) problems.push('schema must be a Zod object');
  else if (tool.schema.def.catchall?.def?.type !== 'never') problems.push('schema must be .strict() so unknown arguments are rejected');
  if (typeof tool?.run !== 'function') problems.push('run must be a function (args, ctx)');
  if (problems.length) throw new Error(`Invalid agent tool "${tool?.name ?? '?'}": ${problems.join('; ')}.`);
  return Object.freeze({ ...tool });
}
