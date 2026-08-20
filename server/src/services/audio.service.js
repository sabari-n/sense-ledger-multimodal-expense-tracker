import { env } from '../config/env.js';
import { aiPipelineDuration } from '../config/metrics.js';

function getDuration(start) {
  const diff = process.hrtime(start);
  return diff[0] + diff[1] / 1e9;
}

/**
 * Transcribe an audio file via the Whisper microservice.
 *
 * @param {string} audioPath  Absolute path to the audio file on disk
 * @returns {Promise<string>} Trimmed transcript text
 */
export async function transcribeAudio(audioPath) {
  const start = process.hrtime();
  try {
    const response = await fetch(env.whisper.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_path: audioPath }),
    });

    const result = await response.json();
    if (!response.ok) {
      aiPipelineDuration.observe({ pipeline_type: 'whisper', status: 'error' }, getDuration(start));
      throw new Error(result.error || 'Whisper microservice failed.');
    }

    aiPipelineDuration.observe({ pipeline_type: 'whisper', status: 'success' }, getDuration(start));
    return result.text ? result.text.trim() : '';
  } catch (err) {
    aiPipelineDuration.observe({ pipeline_type: 'whisper', status: 'error' }, getDuration(start));
    throw err;
  }
}

// Re-export from dedicated llm.service for backward compatibility
export { extractWithLLM } from './llm.service.js';
