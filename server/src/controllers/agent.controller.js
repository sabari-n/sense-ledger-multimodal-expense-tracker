import { askLedger } from '../agent/agent.service.js';
import { successResponse } from '../utils/response.js';

/** POST /api/agent/ask — answer a question about the ledger. */
export const ask = async (req, res, next) => {
  try {
    const { question, history } = req.body;
    const result = await askLedger({ question, history, channel: 'api' });
    return successResponse(res, result);
  } catch (err) {
    next(err);
  }
};
