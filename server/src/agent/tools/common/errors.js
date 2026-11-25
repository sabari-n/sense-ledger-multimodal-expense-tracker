/**
 * A problem with the model's arguments (bad date, unknown category…). It is reported back to
 * the model as `{ ok: false, error }` so it can fix the call — not logged as a failure.
 */
export class ToolInputError extends Error {}
