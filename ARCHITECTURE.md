# 🎙️ SenseLedger - AI Multi-Modal Expense Tracker Architecture

SenseLedger is a full-stack, 100% local, multi-modal AI expense tracking platform designed for Web, Mobile, and Telegram interfaces. It allows users to record natural voice notes, snap photos of receipts/bills, or write shorthand text to automatically categorize and log financial transactions.

The system processes audio via **OpenAI Whisper**, extracts receipt text via **PaddleOCR**, parses structured parameters via a local LLM (**Ollama** with `llama3.2:1b`), streams ingestion events through **Apache Kafka**, and persists financial records in **PostgreSQL** with dynamic Indian Rupee (₹) balance computation.

---

## 🏛️ High-Level System Architecture

The application is containerized with Docker Compose into decoupled microservices communicating through synchronous REST APIs and an asynchronous Apache Kafka event bus:

```mermaid
flowchart TD
    subgraph Clients["📱 Client Ingestion Interfaces"]
        WebClient["💻 Web Client<br/>(React 19 + Vite + Chart.js)"]
        Telegram["🤖 Telegram Bot Gateway<br/>(Voice 🎙️ / Photo 📸 / Text ✍️)"]
    end

    subgraph Streaming["⚡ Event Streaming Backbone (Apache Kafka)"]
        K_Audio[["audio-ingestion-events"]]
        K_Image[["image-ingestion-events"]]
        K_Text[["text-extracted-events"]]
        K_Struct[["expense-structured-events"]]
    end

    subgraph Perception["🤖 Local AI Perception Services"]
        Whisper["🎙️ Whisper Service<br/>(Python + Flask + Whisper tiny.en)"]
        OCR["📸 OCR Service<br/>(Python + Flask + PaddleOCR PP-OCRv4)"]
        Ollama["🧠 Ollama LLM Service<br/>(Llama 3.2 1B / Llama 3)"]
    end

    subgraph Backend["🚀 Backend Core & Persistence"]
        API["Node.js Express Server<br/>(REST API + Kafka Producers/Consumers)"]
        DB[("🐘 PostgreSQL 15<br/>(Expenses, Accounts, Categories, Logs)")]
    end

    %% Web Synchronous Flow
    WebClient -->|REST API / HTTP| API
    API -->|Synchronous Audio Processing| Whisper
    API -->|Synchronous Prompt Extraction| Ollama
    API -->|SQL Queries / Sequelize| DB

    %% Telegram Asynchronous Event Flow
    Telegram -->|Voice / Audio Notes| K_Audio
    Telegram -->|Receipt / Bill Photos| K_Image
    Telegram -->|Direct Text Messages| K_Text

    K_Audio -->|Consume Audio| Whisper
    Whisper -->|Publish Transcribed Text| K_Text

    K_Image -->|Consume Photo| OCR
    OCR -->|Publish Extracted Text| K_Text

    K_Text -->|Consume Raw Text| API
    API -->|Prompt with In-Memory Taxonomy| Ollama
    Ollama -->|Return JSON| API
    API -->|Publish Structured Event| K_Struct

    K_Struct -->|Consume & Validate| API
    API -->|Save Transaction| DB
    API -->|Edit Message & Interactive Buttons| Telegram
```

---

## 🔄 Ingestion & Processing Pipelines

### 1. ⚡ Asynchronous Multi-Modal Telegram Pipeline (Event-Driven)

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Telegram)
    participant TG as Telegram Bot
    participant Kafka as Apache Kafka
    participant Whisper as Whisper Service
    participant OCR as OCR Service
    participant LLMW as LLM Worker (API)
    participant Ollama as Ollama LLM
    participant Persist as Persistence Worker (API)
    participant DB as PostgreSQL 15

    alt Voice / Audio Note
        User->>TG: Send Voice Note / Audio
        TG->>TG: Download media to shared volume
        TG->>Kafka: Publish to audio-ingestion-events
        TG-->>User: Status: "Queued for processing..."
        Kafka->>Whisper: Consume audio-ingestion-events
        Whisper->>Whisper: Transcribe audio (tiny.en)
        Whisper->>Kafka: Publish to text-extracted-events
    else Receipt Photo / Bill
        User->>TG: Send Photo of Receipt
        TG->>TG: Download media to shared volume
        TG->>Kafka: Publish to image-ingestion-events
        TG-->>User: Status: "Queued for processing..."
        Kafka->>OCR: Consume image-ingestion-events
        OCR->>OCR: Run PP-OCRv4 + regex decimal fix
        OCR->>Kafka: Publish to text-extracted-events
    else Direct Text
        User->>TG: Send text: "Spent 450 on fuel via HDFC"
        TG->>Kafka: Publish to text-extracted-events
        TG-->>User: Status: "Queued for processing..."
    end

    Kafka->>LLMW: Consume text-extracted-events
    LLMW->>TG: Update status: "Extracting details with local LLM..."
    LLMW->>Ollama: Generate JSON extraction (with dynamic accounts & categories)
    Ollama-->>LLMW: { amount: 450, category: "Transport", account: "HDFC Bank", type: "expense" }
    LLMW->>Kafka: Publish to expense-structured-events

    Kafka->>Persist: Consume expense-structured-events
    Persist->>DB: INSERT into expenses & update balances
    DB-->>Persist: Saved transaction
    Persist->>TG: Edit message with summary card, timing breakdown & action buttons
    TG-->>User: 💸 Transaction Recorded! [🗑️ Delete] [✏️ Correct]
```

### 2. 💻 Synchronous Web Client Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Browser)
    participant Web as React Web Client
    participant API as Express API
    participant Whisper as Whisper Service
    participant Ollama as Ollama LLM
    participant DB as PostgreSQL 15

    User->>Web: Record Voice Transaction & Click Stop
    Web->>API: POST /api/expenses/upload-audio (multipart/form-data)
    API->>Whisper: POST /transcribe { audio_path }
    Whisper-->>API: Transcribed Text
    API->>Ollama: POST /api/chat (JSON structured extraction)
    Ollama-->>API: Extracted Transaction Data
    API->>DB: INSERT INTO expenses (...)
    DB-->>API: Saved Record
    API-->>Web: JSON Response with Created Expense
    Web-->>User: Update Balance & Transactions list in real-time
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
    ACCOUNTS ||--o{ EXPENSES : "funds (account)"
    ACCOUNTS ||--o{ EXPENSES : "receives (to_account)"
    CATEGORIES ||--o{ EXPENSES : "classifies"

    ACCOUNTS {
        int id PK
        varchar(100) name UK
        varchar(50) account_type
        decimal balance
        varchar(50) icon
        varchar(20) color
        boolean is_default
        boolean include_in_total
        timestamp created_at
    }

    EXPENSES {
        int id PK
        text original_text
        decimal amount
        text category
        text subcategory
        varchar(20) transaction_type
        varchar(100) account
        varchar(100) to_account
        timestamp date
    }

    CATEGORIES {
        int id PK
        varchar(100) name UK
        varchar(20) emoji
        varchar(20) transaction_type
        jsonb subcategories
        boolean is_system
        int sort_order
        timestamp created_at
    }

    TELEGRAM_RAW_MESSAGES {
        int id PK
        bigint chat_id
        varchar(20) message_type
        text raw_text
        varchar(20) status
        timestamp created_at
    }
```

### Dynamic Resolution & Caching Layer
- **In-Memory Caches**: On startup, `account.repository.js` and `category.repository.js` load active accounts and categories into in-memory maps.
- **Fuzzy Entity Resolution**: When LLM returns account aliases (e.g., `"hdfc"`, `"cash"`, `"credit card"`), the system matches them against existing configured accounts with default fallback.
- **Dynamic Computed Balances**: Account balances are dynamically aggregated by summing Initial Balance + Incomes + Incoming Transfers - Expenses - Outgoing Transfers.

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
- `POST /api/accounts`: Create a new custom account (`name`, `account_type`, `balance`, `icon`, `color`, `include_in_total`).
- `PUT /api/accounts/:id`: Update account metadata and configuration.
- `DELETE /api/accounts/:id`: Delete account (expenses fallback to default account).
- `POST /api/accounts/transfer`: Record a transfer transaction between two accounts (`from_account`, `to_account`, `amount`).

### 🏷️ Categories (`/api/categories`)
- `GET /api/categories?type=expense|income`: Retrieve categories with nested subcategory JSON.
- `POST /api/categories`: Create a new category with custom emoji and subcategory arrays.
- `PUT /api/categories/:id`: Update category name, emoji, or subcategories.
- `DELETE /api/categories/:id`: Delete category.

### 🤖 Telegram Webhook (`/api/telegram`)
- `POST /api/telegram/webhook`: Webhook endpoint for production Telegram deployments (alternative to long-polling mode).

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
