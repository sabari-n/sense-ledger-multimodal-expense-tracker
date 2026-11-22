# LLM model benchmark

Compares Ollama models on SenseLedger's transaction extraction, using the app's
real prompt, Ollama connection and post-processing rules.

Each case is scored twice:

- **raw**: the model's JSON answer on its own.
- **final**: after the app's rules (`normalizeExtracted`). This is what the app saves.

A case passes when every expected field matches: amount, type, and, where the case
lists them, category, account and to_account.

## Run it

The Docker stack must be running, and the API container must be able to reach Ollama.

```bash
# Pull the models you want to compare
ollama pull gemma3:4b
ollama pull qwen2.5:7b

# Compare them (model names as shown by `ollama list`)
./benchmarks/llm/run.sh llama3.2:1b gemma3:4b qwen2.5:7b

# Also print each model's answer per case
./benchmarks/llm/run.sh gemma3:4b --verbose
```

Output looks like this:

```
=== gemma3:4b
  food delivery receipt        3943ms  raw ok                             final ok
  card payment                 3373ms  raw miss(account)                  final ok
  ...
=== Summary  (raw = model alone, final = after app rules = what gets saved)
  model             raw     final   median   max
  gemma3:4b         10/13   12/13   3.62s    3.94s
```

Full answers for every case are saved to `results/<timestamp>.json`.

Run models one after another. The script unloads each model before starting the next.
Timings are inflated while an `ollama pull` is running at the same time.

## Files

| File | Purpose |
|---|---|
| `run.sh` | Copies this folder into the `expense-api` container, runs the benchmark, saves results. |
| `bench.mjs` | The benchmark. It runs inside the container so it can import the app's prompt and rules. |
| `cases.json` | Test sentences and expected results. Add your own here. |
| `fixtures/` | OCR text for receipt cases, referenced by `textFile` in `cases.json`. Personal details are replaced with placeholders. |

### Adding a case

```json
{ "name": "fuel", "text": "filled petrol for 800 using upi",
  "expect": { "amount": 800, "type": "expense", "category": "Transport", "account": "UPI" } }
```

- `type` is `expense`, `income` or `transfer`.
- Use `"amount": null` for messages that should not be recorded.
- Leave out a field to skip checking it.
- Use `"textFile": "fixtures/x.txt"` instead of `text` for long OCR output.

## Results so far

Apple M5 Pro (Metal), Ollama 0.40, 13 cases, 2026-11-22. Raw scores vary by about ±1
between runs, because model output isn't fully deterministic.

| Model | Raw | Final | Median time |
|---|---|---|---|
| `llama3.2:1b` (current) | 0–2/13 | 10–11/13 | 1.1s |
| `llama3.2:3b` | 1/13 | 11/13 | 2.8s |
| `gemma3:4b` | 10/13 | 12/13 | 3.4s |
| `qwen2.5:7b` | 8–9/13 | 12/13 | 5.5s |
| `llama3.1:8b` | 11/13 | 12/13 | 6.3s |

Per-case results and each model's answers are in **[RESULTS.md](RESULTS.md)**.

What these show:

- **The 1B and 3B Llama models rely almost entirely on the app's rules.** On their own
  they answer "Food / Union Bank" for most inputs.
- **`gemma3:4b` gets most cases right without help.** That includes the food delivery
  receipt's Bill Total, spoken amounts ("two thousand rupees") and both transfers.
- **The rules can override a correct answer.** `qwen2.5:7b` answered "Health" for
  "medicines", but the app's keyword rule only knows "medicine", so it replaced that
  with "Other". The stronger the model, the more such rules get in the way.

## Switching the app's model

```bash
ollama pull gemma3:4b
# in .env
OLLAMA_MODEL=gemma3:4b
docker compose up -d --force-recreate api
```
