# SenseLedger Learning Roadmap

What to learn next after building SenseLedger, with each new skill added as a real feature of this app rather than a separate toy project.

## Where things stand

SenseLedger already covers:

- Prompting, with taxonomy injection and guardrails against made-up amounts
- Local LLM inference with Ollama
- Speech-to-text (Whisper) and receipt OCR (PaddleOCR)
- An event-driven pipeline on Kafka
- A benchmark comparing models on extraction accuracy

## The roadmap

Each step builds on the one before.

| # | Feature | Main skill |
|---|---|---|
| 1 | Ask your ledger | Tool calling and agents |
| 2 | Eval suite | Evals |
| 3 | Fine-tuned 1B model | Fine-tuning |
| 4 | Search over receipts | RAG |
| 5 | LLM tracing | Observability |

---

### 1. Tool calling and an agent: "ask your ledger"

Let users ask questions in Telegram or the web UI:

- *"How much did I spend on food in October compared with September?"*
- *"Which account is running low?"*

The LLM gets tools such as `query_expenses(category, date_range)` and `get_balances()`. It decides which to call and answers from the results.

**You'll learn:** function calling, agent loops, safe text-to-SQL (validated tools instead of raw SQL), and multi-step reasoning.

**Why first:** it's the biggest change in what the app can do, and it reuses the Telegram bot as the chat interface.

**Done when:** the bot answers spending and balance questions correctly from the database, and refuses questions it can't answer from the data.

### 2. Evals

Turn the 13-case benchmark in [`benchmarks/llm`](../benchmarks/llm) into a real eval suite:

- 100+ test cases for extraction, plus test questions for the step 1 agent
- Results saved per run so runs can be compared
- A regression check on every prompt or model change
- An LLM judging free-text agent answers

**You'll learn:** how to tell whether a change made the system better or worse.

**Done when:** one command runs the suite and shows what improved and what regressed against the last run.

### 3. Fine-tuning a small model

The benchmark showed `llama3.2:1b` is fast but less accurate than `gemma3:4b`. Fine-tune it on this app's own data:

- Saved transactions as input/output pairs
- Corrections made with ✏️ Correct in Telegram as fixed examples
- LoRA fine-tuning with MLX on a Mac, or Unsloth
- Quantize the result and serve it in Ollama

**You'll learn:** preparing a dataset, LoRA, quantization, and serving a custom model.

**Done when:** the step 2 evals show the fine-tuned 1B model close to `gemma3:4b` accuracy at roughly 4× the speed.

### 4. RAG over receipts and documents

Store OCR text and transaction notes as embeddings with pgvector, which fits into the existing Postgres. That enables questions like:

- *"When did I last buy a phone charger, and where?"*
- *"Is my laptop still under warranty?"* (from a saved receipt photo)

**You'll learn:** embeddings, chunking, vector search, and combining keyword and vector search.

**Done when:** questions about past purchases return the right receipt, and the eval suite covers retrieval quality.

### 5. LLM observability

Add tracing with Langfuse or OpenTelemetry alongside the existing Grafana stack. For each LLM call, track:

- The prompt and response
- Latency and token count
- Whether the user later corrected the result

**You'll learn:** how production AI systems are monitored and debugged.

**Done when:** a Grafana panel shows extraction correction rate over time, and any bad result can be traced back to its prompt.

---

## Changing the order

The order above suits general learning and product building. If the goal is an AI engineering job, move evals (step 2) and fine-tuning (step 3) earlier, since they stand out more on a résumé.
