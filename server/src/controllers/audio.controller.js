import fs from 'fs';
import { transcribeAudio } from '../services/audio.service.js';
import { extractWithLLM } from '../services/llm.service.js';

import { SILENCE_PATTERNS } from '../utils/constants.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { logger } from '../config/logger.js';

/**
 * POST /api/audio/process
 *
 * Accepts a multipart audio file upload and an optional `prompt` body field.
 * Runs: upload → Whisper transcription → LLM extraction (if prompt provided).
 * Does NOT save to DB — callers decide what to do with the result.
 *
 * Response: { transcribedText, result? }
 */
export const processAudio = async (req, res, next) => {
  const audioPath = req.file?.path;
  if (!audioPath) return errorResponse(res, 'No audio file uploaded.', 400);

  try {
    const transcribedText = await transcribeAudio(audioPath);

    const cleanText = transcribedText.toLowerCase().replace(/[^a-z]/g, '');
    if (!transcribedText || transcribedText.length < 2 || SILENCE_PATTERNS.has(cleanText)) {
      return errorResponse(res, 'No meaningful speech detected in the audio.', 400);
    }

    if (!req.body?.prompt) {
      return successResponse(res, { transcribedText });
    }

    const result = await extractWithLLM(transcribedText, req.body.prompt);
    return successResponse(res, { transcribedText, result });

  } catch (err) {
    logger.error('Audio pipeline error:', err);
    next(err);
  } finally {
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
};
