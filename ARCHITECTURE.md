# 🎙️ SenseLedger - AI Multi-Modal Expense Tracker Architecture

SenseLedger is a full-stack, 100% local, multi-modal AI expense tracking platform designed for Web, Mobile, and Telegram interfaces. It allows users to record natural voice notes, snap photos of receipts/bills, or write shorthand text to automatically categorize and log financial transactions.

The system processes audio via **OpenAI Whisper**, extracts receipt text via **PaddleOCR**, parses structured parameters via a local LLM (**Ollama** with `llama3.2:1b`), streams ingestion events through **Apache Kafka**, and persists financial records in **PostgreSQL** with dynamic Indian Rupee (₹) balance computation.

---

## 🏛️ High-Level System Architecture

The application is containerized with Docker Compose into decoupled microservices communicating through synchronous REST APIs and an asynchronous Apache Kafka event bus:

<p align="center">
  <a href="docs/architecture.svg"><img src="docs/architecture.svg" alt="SenseLedger architecture: Telegram and Web UI paths, the Kafka event bus, local AI services and PostgreSQL" width="100%"></a>
</p>

<sub>Click the diagram to open it full size. Source: <a href="docs/architecture.excalidraw"><code>docs/architecture.excalidraw</code></a>. Open it at <a href="https://excalidraw.com">excalidraw.com</a> to edit, then export it as SVG over <code>docs/architecture.svg</code>.</sub>

Key points about the flow:

- **One Node.js process, several roles.** The `expense-api` container hosts the REST API, the Telegram bot (long polling), and both Kafka consumers (LLM worker and Persistence worker). Telegram is not a separate service. Its messages enter the system through the bot inside the API.
- **Two paths into the AI services.** The Web Client's voice upload calls Whisper (`POST /transcribe`) and Ollama **synchronously** inside the HTTP request. Telegram media goes **asynchronously** through Kafka, where Whisper and PaddleOCR run background consumer threads.
- **Files travel by path, not by payload.** The API saves uploads and Telegram downloads to the shared `./uploads` volume. REST calls and Kafka events carry only `filePath` / `audio_path`, which Whisper and OCR read from the same mount.
- **Inline actions skip Kafka.** 🗑️ Delete and ✏️ Correct callbacks are handled directly by the bot: Delete removes the row, and Correct calls the LLM and updates the row in place.

---

## 🔄 Ingestion & Processing Pipelines

### 1. ⚡ Asynchronous Multi-Modal Telegram Pipeline (Event-Driven)

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Telegram)
    participant TG as Telegram Bot (API process)
    participant Vol as ./uploads (shared volume)
    participant Kafka as Apache Kafka
    participant Whisper as Whisper Worker
    participant OCR as OCR Worker
    participant LLMW as LLM Worker (API process)
    participant Ollama as Ollama LLM
    participant Persist as Persistence Worker (API process)
    participant DB as PostgreSQL 15

    alt Voice / Audio Note
        User->>TG: Send Voice Note / Audio
        TG-->>User: Status message: "Received audio! Queueing…"
        TG->>Vol: Download media (tg-voice-*.ogg)
        TG->>Kafka: Publish audio-ingestion-events { filePath, chatId, statusMsgId }
        TG-->>User: Edit status: "Queued for processing!"
        Kafka->>Whisper: Consume audio-ingestion-events
        Whisper->>Vol: Read filePath
        Whisper->>Whisper: Transcribe audio (tiny.en)
        Whisper->>Kafka: Publish text-extracted-events { rawText, whisperMs }
    else Receipt Photo / Bill
        User->>TG: Send Photo of Receipt
        TG-->>User: Status message: "Received photo! Queueing…"
        TG->>Vol: Download largest photo size (tg-photo-*.jpg)
        TG->>Kafka: Publish image-ingestion-events { filePath, chatId, statusMsgId }
        TG-->>User: Edit status: "Queued for processing!"
        Kafka->>OCR: Consume image-ingestion-events
        OCR->>Vol: Read filePath
        OCR->>OCR: Run PP-OCRv4 + regex decimal fix
        OCR->>Kafka: Publish text-extracted-events { rawText, ocrMs }
    else Direct Text
        User->>TG: Send text: "Spent 450 on fuel via HDFC"
        TG->>DB: INSERT telegram_raw_messages (audit log)
        TG-->>User: Status message: "Queued for processing!"
        TG->>Kafka: Publish text-extracted-events { rawText }
    end

    Kafka->>LLMW: Consume text-extracted-events
    LLMW->>TG: Edit status: "Extracting expense details with local LLM…"
    LLMW->>Ollama: /api/chat (prompt with in-memory accounts & categories, format: json)
    Ollama-->>LLMW: { amount: 450, category: "Transport", account: "hdfc", transaction_type: "expense" }
    LLMW->>LLMW: normalizeExtracted() — regex guardrails for amount / type
    LLMW->>Kafka: Publish expense-structured-events { extractedData, llmMs }

    Kafka->>Persist: Consume expense-structured-events
    alt No amount, or invalid transfer
        Persist->>TG: Edit status: "⚠️ Couldn't detect a transaction amount"
    else Valid extraction
        Persist->>Persist: Resolve account / to_account / category (in-memory cache, default fallback)
        Persist->>DB: INSERT INTO expenses
        DB-->>Persist: Saved row (id)
        Persist->>TG: Edit status → summary card + timing breakdown + inline buttons
    end
    TG-->>User: 💸 Transaction Recorded! [🗑️ Delete] [✏️ Correct]
```

### 2. 🎛️ Telegram Inline Actions (Direct, no Kafka)

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Telegram)
    participant TG as Telegram Bot (API process)
    participant Ollama as Ollama LLM
    participant DB as PostgreSQL 15

    alt 🗑️ Delete
        User->>TG: callback_query delete_{id}
        TG->>DB: DELETE FROM expenses WHERE id
        TG-->>User: Edit message: "Transaction #id deleted."
    else ✏️ Correct
        User->>TG: callback_query edit_{id}
        TG->>TG: pendingCorrections.set(chatId, id)
        TG-->>User: "Send your correction for Transaction #id"
        User->>TG: Text: "Amount is 500, category Food"
        TG->>DB: SELECT current expense
        TG->>Ollama: /api/chat (existing row + correction text)
        Ollama-->>TG: Updated fields JSON
        TG->>TG: Resolve account / category
        TG->>DB: UPDATE expenses SET …
        TG-->>User: "✅ Transaction #id Updated!"
    end
```

### 3. 💻 Synchronous Web Client Pipeline

The whole pipeline runs inside one HTTP request. Kafka is not involved.

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Browser)
    participant Web as React Web Client
    participant API as Express API
    participant Vol as ./uploads (shared volume)
    participant Whisper as Whisper Service
    participant Ollama as Ollama LLM
    participant DB as PostgreSQL 15

    User->>Web: Record Voice Transaction & Click Stop
    Web->>API: POST /api/expenses/upload-audio (multipart/form-data)
    API->>Vol: multer saves audio-*.webm
    API->>Whisper: POST /transcribe { audio_path }
    Whisper->>Vol: Read audio_path
    Whisper-->>API: Transcribed Text
    API->>API: Reject silence / empty transcript (400)
    API->>Ollama: POST /api/chat (prompt with accounts & categories, format: json)
    Ollama-->>API: Extracted Transaction Data
    API->>API: Regex guardrails + resolve account / category, validate transfer
    API->>DB: INSERT INTO expenses (...)
    DB-->>API: Saved Record
    API-->>Web: JSON Response with Created Expense
    Web-->>User: Refresh balances & transactions list
```

---

## 📦 Microservices Breakdown

| Service | Container Name | Technology Stack | Ports | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **`client`** | `expense-client` | React 19, Vite, Chart.js, Lucide Icons, Nginx | `80:80` (prod)<br/>`5173:5173` (dev) | Single-page application, live voice recorder, multi-account cards, analytics breakdown charts, manual transaction CRUD. |
| **`api`** | `expense-api` | Node.js, Express, Sequelize, KafkaJS, `node-telegram-bot-api` | `9088:9088` | REST API gateway, Telegram bot service, Kafka LLM & Persistence consumers/producers, in-memory taxonomy caching. |
| **`whisper`** | `expense-whisper` | Python 3.10, Flask, OpenAI Whisper (`tiny.en`), `kafka-python` | `5000:5000` | In-memory speech-to-text model, HTTP `/transcribe` endpoint, Kafka consumer on `audio-ingestion-events`. |
| **`ocr`** | `expense-ocr` | Python 3.10, Flask, PaddleOCR 2.8.1 (`PP-OCRv4`), `kafka-python` | `5001:5001` | In-memory OCR model, decimal formatting heuristic, HTTP `/ocr` endpoint, Kafka consumer on `image-ingestion-events`. |
| **`ollama`** | `expense-ollama` | Ollama Engine (`llama3.2:1b` / `llama3`) | `11434:11434` | Local LLM inference engine providing JSON extraction from raw natural text. |
| **`kafka`** | `expense-kafka` | Apache Kafka (KRaft mode) | `9092:9092` | Distributed event streaming broker for asynchronous audio, image, text, and transaction pipelines. |
| **`kafka-ui`** | `expense-kafka-ui` | Provectus Kafka-UI | `8090:8080` (dev) | Web management dashboard for inspecting Kafka topics, partitions, consumer lag, and event payloads. |
| **`postgres`** | `expense-postgres` | PostgreSQL 15, Alpine | `6033:5432` | Relational persistent store for expenses, accounts, categories, and Telegram audit logs. |

---

## ⚡ Kafka Topics & Event Schemas

The Kafka backbone operates with 4 core topics:

### 1. `audio-ingestion-events`
Published when a user sends a voice note or audio file via Telegram.
```json
{
  "eventId": "evt_1724058123456_a1b2c",
  "source": "telegram",
  "messageType": "voice",
  "filePath": "/app/uploads/tg-voice-1724058123456.ogg",
  "chatId": 123456789,
  "statusMsgId": 42,
  "startedAt": 1724058123456,
  "timings": { "ingestionMs": 45 }
}
```

### 2. `image-ingestion-events`
Published when a user sends a receipt or invoice photo via Telegram.
```json
{
  "eventId": "evt_1724058123456_d4e5f",
  "source": "telegram",
  "messageType": "photo",
  "filePath": "/app/uploads/tg-photo-1724058123456.jpg",
  "chatId": 123456789,
  "statusMsgId": 43,
  "startedAt": 1724058123456,
  "timings": { "ingestionMs": 60 }
}
```

### 3. `text-extracted-events`
Published after Whisper speech-to-text, PaddleOCR, or directly from text notes.
```json
{
  "eventId": "evt_1724058123456_a1b2c",
  "source": "telegram",
  "messageType": "voice",
  "rawText": "Paid 350 rupees for lunch with HDFC bank",
  "chatId": 123456789,
  "statusMsgId": 42,
  "startedAt": 1724058123456,
  "timings": { "ingestionMs": 45, "whisperMs": 320 }
}
```

### 4. `expense-structured-events`
Published by the LLM extraction worker after JSON parameter extraction.
```json
{
  "eventId": "evt_1724058123456_a1b2c",
  "rawText": "Paid 350 rupees for lunch with HDFC bank",
  "extractedData": {
    "amount": 350,
    "category": "Food",
    "subcategory": "Lunch",
    "transaction_type": "expense",
    "account": "HDFC Bank",
    "to_account": null
  },
  "chatId": 123456789,
  "statusMsgId": 42,
  "startedAt": 1724058123456,
  "timings": { "ingestionMs": 45, "whisperMs": 320, "llmMs": 750 }
}
```

---

## 🗄️ Database Schema & Entity Relationships

```mermaid
erDiagram
    ACCOUNTS ||--o{ EXPENSES : "funds (account_id)"
    ACCOUNTS ||--o{ EXPENSES : "receives (to_account_id)"
    CATEGORIES ||--o{ EXPENSES : "classifies (category_id)"

    ACCOUNTS {
        int id PK
        varchar(100) name UK "unique, case-insensitive"
        varchar(50) account_type
        varchar(50) icon
        varchar(20) color
        boolean is_default "at most one true"
        boolean include_in_total
        timestamptz created_at
        timestamptz updated_at
    }

    EXPENSES {
        int id PK
        varchar(20) transaction_type "expense | income | transfer"
        numeric(14_2) amount "greater than 0"
        int account_id FK
        int to_account_id FK "transfers only"
        int category_id FK
        text subcategory
        text original_text
        varchar(20) source "manual | voice | telegram | adjustment | unknown"
        timestamptz date
        timestamptz created_at
        timestamptz updated_at
    }

    CATEGORIES {
        int id PK
        varchar(100) name UK "unique, case-insensitive"
        varchar(20) emoji
        varchar(20) transaction_type
        jsonb subcategories
        boolean is_system
        int sort_order
        timestamptz created_at
        timestamptz updated_at
    }

    TELEGRAM_RAW_MESSAGES {
        int id PK
        bigint chat_id
        varchar(20) message_type
        text raw_text
        timestamptz created_at
    }
```

**Integrity rules enforced by PostgreSQL** (not just the app):
- Foreign keys use ids with `ON DELETE RESTRICT`: a category or account that transactions use can't be deleted (the API answers `409 IN_USE`). Renames don't touch any transaction rows.
- `CHECK` constraints: amount > 0; `transaction_type` is one of the three types; a transfer must have a `to_account_id`, it must differ from `account_id`, and only transfers may have one.
- Indexes on `expenses(date)`, `account_id`, `to_account_id`, `category_id`.

### Balances are derived from the ledger
There is no stored balance column. An account's balance is computed from its transactions:
income + incoming transfers − expenses − outgoing transfers (`expense.repository.js#getAccountTotals`).
Setting a balance in the UI (an opening balance when creating, or a new balance when editing) records an
adjustment transaction for the difference, with `source = 'adjustment'`. Every change to a balance therefore shows up in the transaction list,
and balances can't drift.

### Schema migrations
The schema is owned by versioned migrations in `server/src/migrations/` (`NNN_description.js`, each exporting
`up({ query, transaction })`), not `sequelize.sync()`. They run automatically on API startup (`initDB`) or
with `npm run migrate`. Each migration runs in its own transaction and is recorded in `schema_migrations`.
An advisory lock stops concurrent runs.

To change the schema: add the next numbered file (e.g. `003_add_budgets.js`), update the matching Sequelize
model, and never edit a migration that has already run. Adding a new transaction `source` (e.g. `sms`) only
needs a new value in `server/src/utils/enums.js`.

### Dynamic Resolution & Caching Layer
- **In-Memory Caches**: On startup, `account.repository.js` and `category.repository.js` load active accounts and categories into in-memory maps.
- **Fuzzy Entity Resolution**: When LLM returns account aliases (e.g., `"hdfc"`, `"cash"`, `"credit card"`), the system matches them against existing configured accounts with default fallback.

---

## 🌐 API Reference

Base URL: `http://localhost:9088/api`

### 💸 Expenses (`/api/expenses`)
- `GET /api/expenses`: Retrieve all recorded transactions (ordered by date descending).
- `POST /api/expenses`: Manually create a new transaction (`amount`, `category`, `subcategory`, `account`, `to_account`, `transaction_type`).
- `POST /api/expenses/upload-audio`: Upload audio file (`multipart/form-data`) for synchronous Whisper + Ollama pipeline and immediate persistence.
- `PUT /api/expenses/:id`: Update existing transaction fields.
- `DELETE /api/expenses/:id`: Delete a transaction.

### 🎙️ Audio Processing (`/api/audio`)
- `POST /api/audio/process`: Transcribe audio file and optionally perform LLM extraction without writing to the database.

### 🏦 Accounts (`/api/accounts`)
- `GET /api/accounts`: Fetch all accounts with computed balances and transfer histories.
- `POST /api/accounts`: Create a new custom account (`name`, `account_type`, `balance`, `icon`, `color`, `include_in_total`). A non-zero `balance` is recorded as an "Opening balance" transaction.
- `PUT /api/accounts/:id`: Update an account. Omitted fields keep their value. Sending `balance` records a "Balance adjustment" transaction for the difference.
- `DELETE /api/accounts/:id`: Delete account (expenses fallback to default account).
- `POST /api/accounts/transfer`: Record a transfer transaction between two accounts (`from_account`, `to_account`, `amount`).

### 🏷️ Categories (`/api/categories`)
- `GET /api/categories?type=expense|income`: Retrieve categories with nested subcategory JSON.
- `POST /api/categories`: Create a new category with custom emoji and subcategory arrays.
- `PUT /api/categories/:id`: Update category name, emoji, or subcategories.
- `DELETE /api/categories/:id`: Delete category.

### 🤖 Telegram
By default the bot uses long polling and pulls updates from Telegram itself. An optional `POST /api/telegram/webhook` endpoint is also available for webhook-based deployments.

---

## 🤖 Telegram Bot Interactive Experience

- **Voice Notes & Audio**: Instant transcription via Whisper worker.
- **Receipts & Invoices**: Image text extraction via PaddleOCR worker.
- **Inline Actions**: Every transaction posted to Telegram includes interactive inline buttons:
  - `🗑️ Delete`: Instantly removes the transaction from PostgreSQL.
  - `✏️ Correct`: Sets pending conversation state, enabling natural language follow-up corrections (e.g. *"Change category to Dining and amount to 600"*).
- **Latency Telemetry**: Summary cards report precise pipeline duration breakdown:
  ```text
  💸 Transaction Recorded!
  Amount: -₹350.00
  Category: Food › Lunch
  Account: HDFC Bank
  Type: expense
  Date: 19 Aug 2026

  "Paid 350 rupees for lunch with HDFC bank"

  ⏱️ Processed in 1.12s (Whisper 0.32s · LLM 0.75s · DB 0.05s)
  ```

---

## 🚀 Running & Deploying

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for host development)
- Python 3.10+ (for local worker debugging)

### 1. Environment Configuration
Copy `.env.example` to `.env` and fill in required secrets:
```bash
cp .env.example .env
```
Key variables:
```dotenv
PORT=9088
DB_HOST=postgres
DB_PORT=5432
DB_USER=expense_user
DB_PASSWORD=expense_password
DB_NAME=expense_db

KAFKA_BROKERS=kafka:9092
WHISPER_URL=http://whisper:5000/transcribe
OCR_URL=http://ocr:5001/ocr
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=llama3.2:1b

TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

### 2. Start Services
```bash
# Start all containers in background
docker compose up --build -d

# Check running status
docker compose ps

# Access Services:
# - Web UI:       http://localhost:80 (prod) or http://localhost:5173 (dev)
# - Backend API:  http://localhost:9088
# - Kafka UI:     http://localhost:8090
# - Whisper API:  http://localhost:5000
# - OCR API:      http://localhost:5001
# - Ollama API:   http://localhost:11434
```
