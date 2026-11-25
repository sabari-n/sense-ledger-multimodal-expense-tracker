import { useEffect, useRef, useState } from 'react';

const MAX_QUESTION_CHARS = 500;

const SUGGESTIONS = [
  'How much did I spend on food this month vs last month?',
  'Which account is running low?',
  'What were my 5 biggest expenses last month?',
  'How much did I earn this year?',
];

// How each tool call is described in the "How I got this" trace.
const TOOL_LABELS = {
  get_balances: { icon: 'fa-wallet', label: 'Checked account balances' },
  list_categories: { icon: 'fa-tags', label: 'Looked up categories' },
  sum_transactions: { icon: 'fa-calculator', label: 'Totalled transactions' },
  list_transactions: { icon: 'fa-list-ul', label: 'Listed transactions' },
};

function ToolStep({ step }) {
  const { icon, label } = TOOL_LABELS[step.tool] || { icon: 'fa-wrench', label: step.tool };
  const args = Object.entries(step.arguments || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  return (
    <li className={`ask-step ${step.ok ? '' : 'failed'}`}>
      <div className="ask-step-head">
        <i className={`fa-solid ${step.ok ? icon : 'fa-rotate'}`}></i>
        <span className="ask-step-label">{step.ok ? label : `${label} — retried`}</span>
        <code className="ask-step-tool">{step.tool}</code>
      </div>
      {args.length > 0 && (
        <div className="ask-step-args">
          {args.map(([k, v]) => <span key={k} className="ask-chip">{k}: {String(v)}</span>)}
        </div>
      )}
      {step.ok
        ? <pre className="ask-step-result">{JSON.stringify(step.result, null, 2)}</pre>
        : <p className="ask-step-error">{step.error}</p>}
    </li>
  );
}

function AssistantMessage({ message }) {
  const lookups = message.steps?.length || 0;
  return (
    <div className="ask-row assistant">
      <div className="ask-avatar"><i className="fa-solid fa-coins"></i></div>
      <div className={`ask-bubble assistant ${message.error ? 'error' : ''}`}>
        <p className="ask-text">{message.content}</p>
        {lookups > 0 && (
          <details className="ask-trace">
            <summary>
              <i className="fa-solid fa-magnifying-glass-chart"></i>
              How I got this · {lookups} lookup{lookups === 1 ? '' : 's'}
              {message.meta && <span className="ask-meta"> · {(message.meta.durationMs / 1000).toFixed(1)}s</span>}
            </summary>
            <ol className="ask-steps">
              {message.steps.map((s, i) => <ToolStep key={i} step={s} />)}
            </ol>
            {message.meta && <p className="ask-meta-line">{message.meta.model} · {message.meta.llmCalls} model call{message.meta.llmCalls === 1 ? '' : 's'}</p>}
          </details>
        )}
      </div>
    </div>
  );
}

export default function AskScreen({ messages, loading, onAsk, onReset }) {
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loading]);

  const submit = (text) => {
    const q = text.trim();
    if (!q || loading) return;
    onAsk(q);
    setDraft('');
    inputRef.current?.focus();
  };

  return (
    <div className="ask-screen fade-in">
      <div className="top-header">
        <div className="top-header-left">
          <h1>Ask Ledger</h1>
        </div>
        <div className="top-header-right">
          {messages.length > 0 && (
            <button className="icon-btn" onClick={onReset} disabled={loading} title="New conversation">
              <i className="fa-solid fa-rotate-left"></i>
            </button>
          )}
        </div>
      </div>

      <div className="ask-messages">
        {messages.length === 0 && (
          <div className="ask-empty">
            <div className="ask-empty-icon"><i className="fa-solid fa-comments-dollar"></i></div>
            <h2>Ask about your money</h2>
            <p>Answers come only from your recorded transactions and balances, using the local AI model.</p>
            <div className="ask-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ask-suggestion" onClick={() => submit(s)} disabled={loading}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (m.role === 'user'
          ? (
            <div key={m.id} className="ask-row user">
              <div className="ask-bubble user"><p className="ask-text">{m.content}</p></div>
            </div>
          )
          : <AssistantMessage key={m.id} message={m} />
        ))}

        {loading && (
          <div className="ask-row assistant">
            <div className="ask-avatar"><i className="fa-solid fa-coins"></i></div>
            <div className="ask-bubble assistant thinking" aria-live="polite">
              <span className="ask-dots"><span></span><span></span><span></span></span>
              Checking your ledger…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="ask-input-bar" onSubmit={(e) => { e.preventDefault(); submit(draft); }}>
        <input
          ref={inputRef}
          className="ask-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. How much did I spend on transport last month?"
          maxLength={MAX_QUESTION_CHARS}
          aria-label="Ask a question about your ledger"
        />
        <button className="ask-send" type="submit" disabled={loading || !draft.trim()} aria-label="Send">
          <i className="fa-solid fa-paper-plane"></i>
        </button>
      </form>
    </div>
  );
}
