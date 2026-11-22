# LLM Benchmark Results: 2026-11-22

All five models were run in one pass with `./benchmarks/llm/run.sh llama3.2:1b llama3.2:3b gemma3:4b qwen2.5:7b llama3.1:8b --verbose`.
Hardware: Apple M5 Pro (48 GB), Metal GPU, Ollama 0.40.17. 13 cases from [cases.json](cases.json).

- **Raw** scores the model's own JSON answer.
- **Final** scores the answer after the app's rules (`normalizeExtracted`). This is what the app saves.
- A ❌ lists the fields that were wrong.

## Summary

| Model | Raw | Final | Median time | Max time |
|---|---|---|---|---|
| `llama3.2:1b` | 0/13 | 10/13 | 1.1s (4.5s in this run, see note) | 6.06s |
| `llama3.2:3b` | 1/13 | 11/13 | 2.83s | 7.79s |
| `gemma3:4b` | 10/13 | 12/13 | 3.38s | 3.62s |
| `qwen2.5:7b` | 9/13 | 12/13 | 5.49s | 6.42s |
| `llama3.1:8b` | 11/13 | 12/13 | 6.32s | 7s |

> **Note on timing:** a second benchmark run overlapped the start of this one and shared the GPU, so the `llama3.2:1b` times here are inflated. In a separate run on its own, it measured a median of 1.1s and a max of 1.3s, with the same accuracy (1/13 raw, 11/13 final). The `llama3.2:3b` max (7.8s) may also be affected. Raw scores vary by about ±1 between runs.

## Per case: Model alone (raw)

| Case | `llama3.2:1b` | `llama3.2:3b` | `gemma3:4b` | `qwen2.5:7b` | `llama3.1:8b` |
|---|---|---|---|---|---|
| food delivery receipt | ❌ amount, type, category | ❌ amount, type, category | ✅ | ✅ | ❌ amount, type, category |
| grocery receipt | ❌ amount, category | ❌ amount, type, category | ✅ | ✅ | ✅ |
| spoken amount | ❌ amount, category | ❌ amount, category | ✅ | ✅ | ✅ |
| transfer | ❌ type, to_account | ❌ type, to_account | ✅ | ✅ | ✅ |
| transfer (moved into) | ❌ type, account, to_account | ❌ type, account, to_account | ✅ | ❌ account | ✅ |
| card payment | ❌ amount, type, category, account | ❌ amount, type, account | ❌ account | ❌ account | ✅ |
| salary | ❌ amount, type, category, account | ❌ type | ✅ | ✅ | ✅ |
| cashback | ❌ amount, type, category, account | ❌ type, category, account | ❌ category | ❌ category, account | ❌ category, account |
| account from text | ❌ category | ❌ amount, type, category, account | ✅ | ❌ account | ✅ |
| plural keyword | ❌ category | ❌ type, category | ❌ category | ✅ | ✅ |
| rent | ❌ category | ❌ type, category | ✅ | ✅ | ✅ |
| shopping | ❌ category, account | ❌ type, category, account | ✅ | ✅ | ✅ |
| greeting (no transaction) | ❌ amount | ✅ | ✅ | ✅ | ✅ |

## Per case: Saved result (final)

| Case | `llama3.2:1b` | `llama3.2:3b` | `gemma3:4b` | `qwen2.5:7b` | `llama3.1:8b` |
|---|---|---|---|---|---|
| food delivery receipt | ✅ | ✅ | ✅ | ✅ | ✅ |
| grocery receipt | ✅ | ✅ | ✅ | ✅ | ✅ |
| spoken amount | ❌ category | ❌ category | ✅ | ✅ | ✅ |
| transfer | ✅ | ✅ | ✅ | ✅ | ✅ |
| transfer (moved into) | ❌ type, to_account | ✅ | ✅ | ✅ | ✅ |
| card payment | ✅ | ✅ | ✅ | ✅ | ✅ |
| salary | ✅ | ✅ | ✅ | ✅ | ✅ |
| cashback | ✅ | ✅ | ✅ | ✅ | ✅ |
| account from text | ✅ | ✅ | ✅ | ✅ | ✅ |
| plural keyword | ❌ category | ❌ category | ❌ category | ❌ category | ❌ category |
| rent | ✅ | ✅ | ✅ | ✅ | ✅ |
| shopping | ✅ | ✅ | ✅ | ✅ | ✅ |
| greeting (no transaction) | ✅ | ✅ | ✅ | ✅ | ✅ |

## What failed after the app's rules

- **plural keyword** ("spent five hundred on medicines using sodexo") fails on every model. The Health category's keyword is "medicine", which needs the exact word. When the model answers Health correctly (`qwen2.5:7b`, `llama3.1:8b`), the rule still replaces it with Other.
- **transfer (moved into)** ("moved 2000 from icici into cash") fails only for the 1B model. The transfer rules know "moved to" but not "moved … into", so they can't fix the model's answer.
- **spoken amount** fails only for the two Llama 3.2 models, on category. The sentence matches both the Food keyword ("food") and the Rent keyword ("water"), and the rules keep whichever of the two the model picked. Both models picked Rent.

## Answers per model

Format: `amount type category account [-> to_account]`.

<details><summary><code>llama3.2:1b</code></summary>

| Case | Time | Raw answer | Saved answer |
|---|---|---|---|
| food delivery receipt | 3.19s | - - - - | 125 expense Food - |
| grocery receipt | 5.37s | 45 expense bread FRESH MART SUPERMARKET | 195 expense Food FRESH MART SUPERMARKET |
| spoken amount | 4.54s | 30000 expense Rent,Waterbill,Maintenance Union Bank | 2000 expense Rent,Waterbill,Maintenance Union Bank |
| transfer | 6.06s | 1000 expense Food Union Bank | 1000 transfer - Union Bank -> ICICI |
| transfer (moved into) | 2.93s | 2000 expense Food Union Bank | 2000 expense Other ICICI |
| card payment | 4.37s | - - - - | 300 expense Transport Credit Card |
| salary | 1.87s | - - - - | 50000 income Salary Union Bank |
| cashback | 5.14s | 1000 expense Food Union Bank | 500 income Bonus UPI |
| account from text | 2.93s | 120 expense coffee Cash | 120 expense Food Cash |
| plural keyword | 5.54s | 500 expense Food Sodexo | 500 expense Other Sodexo |
| rent | 3.34s | 1500 expense house rent Union Bank | 1500 expense Rent,Waterbill,Maintenance Union Bank |
| shopping | 5.11s | 2499 expense Food Union Bank | 2499 expense Apparel Credit Card |
| greeting (no transaction) | 4.93s | 1000 expense Food Union Bank | - expense Other Union Bank |

</details>

<details><summary><code>llama3.2:3b</code></summary>

| Case | Time | Raw answer | Saved answer |
|---|---|---|---|
| food delivery receipt | 6.73s | 1500 - Transport Union Bank | 125 expense Food Union Bank |
| grocery receipt | 7.71s | 1500 - Transport Union Bank | 195 expense Food Union Bank |
| spoken amount | 7.79s | 30000 expense Rent,Waterbill,Maintenance Union Bank | 2000 expense Rent,Waterbill,Maintenance Union Bank |
| transfer | 7.14s | 1000 - Food Union Bank | 1000 transfer - Union Bank -> ICICI |
| transfer (moved into) | 5.42s | 2000 - Transport Union Bank -> ICICI | 2000 transfer - ICICI -> Cash |
| card payment | 6.42s | 1500 - Transport Union Bank | 300 expense Transport Credit Card |
| salary | 2.83s | 50000 - Salary Union Bank | 50000 income Salary Union Bank |
| cashback | 2.77s | 500 - Food Union Bank | 500 income Bonus UPI |
| account from text | 2.08s | - - - - | 120 expense Food Cash |
| plural keyword | 2.57s | 500 - Food Sodexo | 500 expense Other Sodexo |
| rent | 2.72s | 1500 - Transport Union Bank | 1500 expense Rent,Waterbill,Maintenance Union Bank |
| shopping | 2.66s | 2499 - Food Union Bank | 2499 expense Apparel Credit Card |
| greeting (no transaction) | 1.87s | - - - - | - expense - - |

</details>

<details><summary><code>gemma3:4b</code></summary>

| Case | Time | Raw answer | Saved answer |
|---|---|---|---|
| food delivery receipt | 3.50s | 125 expense Food Union Bank | 125 expense Food Union Bank |
| grocery receipt | 3.46s | 195 expense Food UPI | 195 expense Food UPI |
| spoken amount | 3.46s | 2000 expense Food Union Bank | 2000 expense Food Union Bank |
| transfer | 3.37s | 1000 transfer Transfer Union Bank -> ICICI | 1000 transfer - Union Bank -> ICICI |
| transfer (moved into) | 3.35s | 2000 transfer Transfer ICICI -> Cash | 2000 transfer - ICICI -> Cash |
| card payment | 3.07s | 300 expense Transport Union Bank | 300 expense Transport Credit Card |
| salary | 3.38s | 50000 income Salary Union Bank | 50000 income Salary Union Bank |
| cashback | 3.09s | 500 income Cashback UPI | 500 income Bonus UPI |
| account from text | 3.56s | 120 expense Food Cash | 120 expense Food Cash |
| plural keyword | 3.62s | 500 expense Food Sodexo | 500 expense Other Sodexo |
| rent | 3.56s | 1500 expense Rent,Waterbill,Maintenance Union Bank | 1500 expense Rent,Waterbill,Maintenance Union Bank |
| shopping | 3.28s | 2499 expense Apparel Credit Card | 2499 expense Apparel Credit Card |
| greeting (no transaction) | 2.63s | - - - - | - expense - - |

</details>

<details><summary><code>qwen2.5:7b</code></summary>

| Case | Time | Raw answer | Saved answer |
|---|---|---|---|
| food delivery receipt | 6.42s | 125 expense Food Union Bank | 125 expense Food Union Bank |
| grocery receipt | 6.05s | 195 expense Food Union Bank | 195 expense Food Union Bank |
| spoken amount | 5.49s | 2000 expense Food Union Bank | 2000 expense Food Union Bank |
| transfer | 5.34s | 1000 transfer Transfer Union Bank -> ICICI | 1000 transfer - Union Bank -> ICICI |
| transfer (moved into) | 5.37s | 2000 transfer Other Union Bank -> Cash | 2000 transfer - ICICI -> Cash |
| card payment | 5.48s | 300 expense Transport Union Bank | 300 expense Transport Credit Card |
| salary | 5.12s | 50000 income Salary Union Bank | 50000 income Salary Union Bank |
| cashback | 5.41s | 500 income Income Union Bank | 500 income Bonus UPI |
| account from text | 5.52s | 120 expense Food Union Bank | 120 expense Food Cash |
| plural keyword | 5.92s | 500 expense Health Sodexo | 500 expense Other Sodexo |
| rent | 5.62s | 1500 expense Rent,Waterbill,Maintenance Union Bank | 1500 expense Rent,Waterbill,Maintenance Union Bank |
| shopping | 5.55s | 2499 expense Apparel Credit Card | 2499 expense Apparel Credit Card |
| greeting (no transaction) | 4.47s | - - - - | - expense - - |

</details>

<details><summary><code>llama3.1:8b</code></summary>

| Case | Time | Raw answer | Saved answer |
|---|---|---|---|
| food delivery receipt | 5.25s | - - - - | 125 expense Food - |
| grocery receipt | 6.45s | 195 expense Food Union Bank | 195 expense Food Union Bank |
| spoken amount | 6.16s | 2000 expense Food Union Bank | 2000 expense Food Union Bank |
| transfer | 6.21s | 1000 transfer Transfer Union Bank -> ICICI | 1000 transfer - Union Bank -> ICICI |
| transfer (moved into) | 6.10s | 2000 transfer Cash ICICI -> Cash | 2000 transfer - ICICI -> Cash |
| card payment | 6.08s | 300 expense Transport Credit Card | 300 expense Transport Credit Card |
| salary | 6.43s | 50000 income Salary Union Bank | 50000 income Salary Union Bank |
| cashback | 7.00s | 500 income Income Union Bank | 500 income Bonus UPI |
| account from text | 6.32s | 120 expense Food Cash | 120 expense Food Cash |
| plural keyword | 6.38s | 500 expense Health Sodexo | 500 expense Other Sodexo |
| rent | 6.53s | 1500 expense Rent,Waterbill,Maintenance Union Bank | 1500 expense Rent,Waterbill,Maintenance Union Bank |
| shopping | 6.36s | 2499 expense Apparel Credit Card | 2499 expense Apparel Credit Card |
| greeting (no transaction) | 5.03s | - - - - | - expense - - |

</details>

Raw console output: `results/20261122-full-run.log`. The `results/` folder is git-ignored, so the log stays on this machine.
