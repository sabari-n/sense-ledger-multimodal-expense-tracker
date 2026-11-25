import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

const HISTORY_MESSAGES = 6;
const REQUEST_TIMEOUT_MS = 120_000; // the server gives up at 90s

let nextId = 0;
const newId = () => `m${++nextId}`;

/**
 * Chat with the ledger agent (POST /api/agent/ask).
 *
 * Lives in App so the conversation survives switching screens. Each question sends the
 * last few successful turns as history, so follow-ups like "and in August?" work.
 */
export function useAgent() {
  const [messages, setMessages] = useState([]); // { id, role, content, steps?, outcome?, meta?, error? }
  const [loading, setLoading] = useState(false);
  const busy = useRef(false); // guards double submits before `loading` re-renders

  const ask = useCallback(async (question) => {
    const q = question.trim();
    if (!q || busy.current) return;
    busy.current = true;

    const history = messages
      .filter((m) => !m.error)
      .slice(-HISTORY_MESSAGES)
      .map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, { id: newId(), role: 'user', content: q }]);
    setLoading(true);
    try {
      const res = await axios.post('/api/agent/ask', { question: q, history }, { timeout: REQUEST_TIMEOUT_MS });
      const d = res.data.data;
      setMessages((prev) => [...prev, {
        id: newId(),
        role: 'assistant',
        content: d.answer,
        steps: d.steps || [],
        outcome: d.outcome,
        meta: { model: d.model, durationMs: d.duration_ms, llmCalls: d.llm_calls },
      }]);
    } catch (err) {
      const content = err.response?.data?.error
        || (err.code === 'ECONNABORTED' ? 'That took too long. Try a narrower question.' : 'Could not reach the server. Please try again.');
      setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content, error: true }]);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [messages]);

  const reset = useCallback(() => {
    if (!busy.current) setMessages([]);
  }, []);

  return { messages, loading, ask, reset };
}
