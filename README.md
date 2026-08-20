# 🎙️ SenseLedger - 100% Local Multi-Modal AI Expense Tracker

SenseLedger is a full-stack, 100% local, multi-modal AI expense tracker designed for **Web**, **Mobile**, and **Telegram**. It allows you to speak naturally, snap photos of receipts, or send quick text shorthand to automatically track expenses, incomes, and account transfers in Indian Rupees (₹) with zero cloud API costs and total privacy.

---

## 🌟 Key Features

- **🎙️ Voice Note Transcription**: Instant Speech-to-Text via OpenAI Whisper (`tiny.en`), processing voice notes and `.mp3`/`.ogg` audio files.
- **📸 Receipt & Invoice OCR**: Optical Character Recognition using PaddleOCR (`PP-OCRv4`) with automated decimal/currency normalization.
- **🤖 Telegram Bot Gateway**: Send voice notes, receipt photos, or text messages directly in Telegram with live processing status updates.
- **⚡ Event-Driven Backbone**: Apache Kafka (KRaft mode) decouples ingestion from AI perception and database writes for non-blocking performance.
- **🧠 100% Local LLM Extraction**: Uses Ollama (`llama3.2:1b` or `llama3`) with dynamic taxonomy injection to parse amount, category, subcategory, account, and transaction type.
- **✏️ Interactive Telegram Actions**: Every recorded transaction in Telegram includes inline `🗑️ Delete` and `✏️ Correct` buttons with multi-turn natural language correction.
- **🏦 Multi-Account Management**: Real-time balance calculations for Cash, Bank Accounts, Credit Cards, and Wallets with inter-account fund transfers.
- **📊 Analytics & Visualizations**: Interactive Doughnut charts powered by Chart.js with dynamic category breakdown badges.
- **🇮🇳 Indian Rupee (`₹`) Standard**: Native Indian currency formatting (e.g. `-₹ 1,500.00`, `₹ 45,000.00`).
- **🛡️ Heuristic Guardrails & Anti-Hallucination**: Deterministic regex validation and prompt guardrails preventing 1B LLMs from hallucinating amounts on greetings or non-financial speech.
- **📱 Responsive Web UI**: React 19 + Vite frontend scaling smoothly from mobile screens to desktop dashboards.

---

## 🏛️ System Architecture

SenseLedger uses a decoupled microservices architecture with a hybrid synchronous REST and asynchronous Kafka event streaming pipeline:

```
📱 Web Client (React 19) ─────────┐
                                  ├──► 🚀 Express API (9088) ──► 🐘 PostgreSQL (6033)
🤖 Telegram Bot (Voice/Photo/Text) ─┤           │
                                  │           ▼
                                  └──► ⚡ Apache Kafka (9092)
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
        🎙️ Whisper (5000)               📸 PaddleOCR (5001)           🧠 Ollama LLM (11434)
      (audio-ingestion-events)       (image-ingestion-events)       (text-extracted-events)
```

👉 For full architecture diagrams, sequence flows, Kafka topic schemas, and entity models, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

---

## 🛠️ Microservices & Ports

| Service | Technology | Port | Description |
| :--- | :--- | :--- | :--- |
| **`expense-client`** | React 19, Vite, Nginx | `80:80` (prod)<br/>`5173:5173` (dev) | Web and mobile frontend dashboard. |
| **`expense-api`** | Node.js, Express, Sequelize | `9088:9088` | Backend REST API & Kafka consumer/producer. |
| **`expense-kafka`** | Apache Kafka (KRaft) | `9092:9092` | Event streaming broker. |
| **`expense-kafka-ui`** | Provectus Kafka UI | `8090:8080` (dev) | Web management console for Kafka topics. |
| **`expense-whisper`** | Python, Flask, Whisper | `5000:5000` | Speech-to-text service (`tiny.en`). |
| **`expense-ocr`** | Python, Flask, PaddleOCR | `5001:5001` | Receipt OCR service (`PP-OCRv4`). |
| **`expense-ollama`** | Ollama Engine | `11434:11434` | Local LLM inference engine (`llama3.2:1b`). |
| **`expense-postgres`** | PostgreSQL 15 | `6033:5432` | Relational database. |
| **`expense-prometheus`** | Prometheus | `9090:9090` | Time-series metrics collection & scraping. |
| **`expense-grafana`** | Grafana | `3000:3000` | Pre-provisioned system & AI telemetry dashboards. |
| **`expense-cadvisor`** | Google cAdvisor | `8085:8080` | Real-time container resource monitoring. |

---

## ⚡ Performance & Hardware Benchmarks

SenseLedger is engineered to run seamlessly on consumer hardware (16GB RAM laptops) with minimal resource overhead.

### Resource & Processing Benchmarks (Grafana Telemetry)

| Component | Technology | RAM Footprint | CPU Usage (Burst) | CPU Container Latency | GPU / Metal Latency |
|---|---|---|---|---|---|
| **Speech-to-Text** | Whisper `tiny.en` | ~75 MB | 2.5 Cores | **0.3s – 0.6s** | **~0.10s** |
| **Receipt OCR** | PaddleOCR `PP-OCRv4` | ~120 MB | 2.0 Cores | **0.3s – 0.5s** | **~0.15s** |
| **LLM (2.5k Prompt Ingest)**| Ollama `llama3.2:1b` | ~1.3 GB | 3.5 Cores (100%) | **~22.0s** *(CPU Matrix)* | **~0.15s** *(GPU Parallel)* |
| **LLM (Token Generation)** | Ollama `llama3.2:1b` | ~1.3 GB | 3.0 Cores | **~2.7s** *(18 tok/s)* | **~0.20s** *(120 tok/s)* |
| **Full Voice Pipeline** | End-to-End | **~3.6 GB Peak** | Dynamic Burst | **~25.2s** | **~0.57s (44x Faster)** |
| **Total Stack (Idle)** | 11 Microservices | **~2.1 GB** | **< 2% total CPU** | — | — |

### 🚀 Enabling GPU Acceleration (44x Faster Inference)

- **macOS (Apple Silicon M1/M2/M3/M4 with Metal)**:
  Run Ollama natively on macOS (`ollama serve`) and set `OLLAMA_HOST=http://host.docker.internal:11434` in `.env`. This enables Apple Metal GPU unified memory acceleration, slashing end-to-end voice-to-card latency from **~25s down to ~0.57s**.
- **Linux / Windows (NVIDIA CUDA)**:
  Install the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) and add GPU device reservations to `ollama` in `docker-compose.yml`.

---

## 🚀 Quick Start (Docker)

### 1. Configure Environment
Copy the sample environment file:
```bash
cp .env.example .env
```
*(Optional: Add your `TELEGRAM_BOT_TOKEN` to enable the Telegram bot).*

### 2. Launch All Containers
```bash
docker compose up --build -d
```

### 3. Access the Applications
- **Web UI**: [http://localhost:80](http://localhost:80) (or [http://localhost:5173](http://localhost:5173) in dev mode)
- **Backend API**: [http://localhost:9088](http://localhost:9088)
- **Kafka UI Console**: [http://localhost:8090](http://localhost:8090)
- **Grafana Monitoring Dashboard**: [http://localhost:3000](http://localhost:3000) *(admin / admin)*
- **Prometheus Metrics**: [http://localhost:9090](http://localhost:9090)

---

## 📖 Additional Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Deep dive into microservices, Kafka event contracts, database schemas, and REST APIs.
- **[MEDIUM_ARTICLE.md](./MEDIUM_ARTICLE.md)**: Article covering the architectural decisions, local AI model selection, and trade-offs.
