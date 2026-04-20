Here is the improved and highly detailed `README.md` tailored to your file structure. It highlights the robust backend architecture—including your caching layer, clustering, local OCR, and multilingual support—while cleanly documenting the tech stack, APIs, and setup processes without the raw `.env` sample.

-----

# 🕵️‍♂️ SatyaBot

**SatyaBot** is a comprehensive, scalable fact-checking platform built for the Indian digital ecosystem. It leverages advanced Large Language Models (LLMs), localized OCR, and real-time news APIs to verify claims, debunk misinformation, and analyze media credibility.

The system operates across multiple touchpoints, including a dedicated Chrome Extension for web users, and integrated bots for WhatsApp and Telegram, allowing users to verify claims wherever they encounter them.

-----

## 🏗️ Architecture & Implementation Details

SatyaBot is engineered with a modular, highly scalable backend architecture designed to handle concurrent verifications, media processing, and rapid data retrieval.

### Core Workflows

1.  **Multi-Channel Ingestion:** Claims are ingested via the Chrome Extension (REST API), WhatsApp (Twilio Webhooks), or Telegram (Polling/Webhooks).
2.  **Preprocessing & OCR:** Incoming media (images) are processed locally using Tesseract OCR (`localOcrService.js`). Multilingual support is enabled via local training data (`eng.traineddata`, `hin.traineddata`), which is crucial for the Indian context. Non-English text is normalized via the `translator.js` utility.
3.  **Caching Layer:** To minimize expensive LLM and API calls, exact or highly similar claims are checked against a Redis cache (`cacheService.js`, `redis.js`).
4.  **Data Aggregation:** If a claim is novel, the backend fetches real-time context using the `newsService.js` (Google News, GDELT APIs) and cross-references it with internal historical datasets (`factcheck_dataset.xlsx` handled by `datasetService.js`).
5.  **LLM Verification:** The aggregated context is fed into high-speed LLMs (Groq/Llama-3 or Gemini) to reason through the claim, generate a credibility score, and formulate a detailed explanation.
6.  **Persistence:** Verification records and metadata are hashed (`hashGenerator.js`) and stored securely in MongoDB for future reference and analytics.

-----

## 💻 Tech Stack

### Backend & Infrastructure

  * **Runtime:** Node.js
  * **Framework:** Express.js (REST API & Webhook handling)
  * **Database:** MongoDB (Mongoose ODMs: `Claim`, `FactCheckRecord`, `Verification`)
  * **Caching:** Redis (with `CACHE_TTL` mechanisms)
  * **Processing:** Local Tesseract OCR (Multilingual text extraction)
  * **Architecture:** Node.js Clustering (`clusterService.js` for multi-core load balancing)

### Client Interfaces

  * **Browser Extension:** Vanilla JavaScript, HTML/CSS, Chrome Extension Manifest V3 (`content.js`, `detector.js`, `injector.js`).
  * **Messaging Bots:** `node-telegram-bot-api`, Twilio API for WhatsApp.

-----

## 🔌 APIs & Integrations

### AI & Large Language Models

  * **Groq API:** Primary LLM provider (e.g., `llama-3.3-70b-versatile`) used for ultra-low latency fact-checking and reasoning.
  * **Google Gemini API:** Secondary LLM integration for complex multimodal reasoning or fallback verification.

### Real-time Context & News

  * **GDELT Project API:** Monitors global news and events in real-time to track the spread of claims.
  * **Google News API (`newsapi.org`):** Fetches immediate journalistic coverage related to extracted keywords.

### Third-Party Services

  * **Twilio:** Handles WhatsApp inbound and outbound messaging via webhooks.
  * **Telegram Bot API:** Interfaces directly with the standalone `telegram-bot.js` microservice.

-----

## 📂 Repository Structure

```text
├── satyabot-backend/          # Main Express API and Business Logic
│   ├── data/                  # Raw and processed datasets (e.g., factcheck_dataset.xlsx)
│   ├── src/
│   │   ├── config/            # DB, Redis, and global constants
│   │   ├── controllers/       # Route handlers (Admin, Verification, Webhooks)
│   │   ├── middleware/        # Security (Rate Limiter) and Error Handling
│   │   ├── models/            # MongoDB Schemas
│   │   ├── routes/            # Express route definitions
│   │   ├── scripts/           # Utilities for dataset ingestion and cache seeding
│   │   ├── services/          # Core logic (LLM, OCR, News, Caching, Clustering)
│   │   └── utils/             # Helpers (Hashing, Logging, Translation)
│   ├── *.traineddata          # Tesseract OCR language packs (English/Hindi)
│   ├── server.js              # Entry point for main API
│   └── wtsp.js                # Dedicated WhatsApp webhook handler
│
├── satyabot-extension/        # Chrome Extension Source Code
│   ├── background.js          # Service worker for API communication
│   ├── content/               # UI injection and text selection listeners
│   ├── popup/                 # Extension popup interface
│   └── utils/                 # DOM scraping and API wrapper
│
└── satyabot-telegram/         # Standalone Telegram Bot Microservice
    └── telegram-bot.js        # Telegram polling/webhook logic
```

-----

## 🚀 Running the Project Locally

To fully test the ecosystem, you must run the backend server, the messaging microservices, and expose them to the web for webhooks.

### Prerequisites

1.  Clone the repository.
2.  Ensure **MongoDB** and **Redis** are running locally on their default ports.
3.  Run `npm install` inside `satyabot-backend/`, `satyabot-telegram/`, and the root directory.
4.  Set up your environment variables. Create a `.env` file in `satyabot-backend/` and `satyabot-telegram/` mapping out your API keys, DB URIs, and webhook secrets.

### Starting the Services

Open **four distinct terminal windows** to launch the microservices simultaneously:

**Terminal 1: Main API & Processing Server**

```bash
cd satyabot-backend
npm run dev
```

**Terminal 2: WhatsApp Webhook Handler**

```bash
cd satyabot-backend
node wtsp.js
```

**Terminal 3: Telegram Bot Server**

```bash
cd satyabot-telegram
node telegram-bot.js
```

**Terminal 4: Reverse Proxy (Ngrok)**
Ngrok is required to expose your local port (5000) to the internet, allowing Twilio and Telegram to send webhook payloads to your local machine.

```bash
ngrok http 5000
```

> **Important:** Copy the generated `https://[id].ngrok-free.app` URL and update your Twilio console and Telegram Webhook configurations accordingly.

### Installing the Chrome Extension

1.  Open Google Chrome and navigate to `chrome://extensions/`.
2.  Toggle **Developer mode** on (top right).
3.  Click **Load unpacked** and select the `satyabot-extension/` directory.
4.  Pin the extension to your toolbar to start verifying claims on the web.

-----

## 📚 References & Resources

  * **Groq API Documentation:** [console.groq.com/docs](https://console.groq.com/docs)
  * **GDELT Project:** [gdeltproject.org](https://www.gdeltproject.org/)
  * **Tesseract OCR (Node):** [tesseract.projectagnostic.com](https://www.google.com/search?q=https://tesseract.projectagnostic.com/)
  * **Twilio WhatsApp API:** [twilio.com/docs/whatsapp](https://www.twilio.com/docs/whatsapp)
  * **Chrome Extensions Manifest V3:** [developer.chrome.com/docs/extensions](https://developer.chrome.com/docs/extensions/)
  * **Redis Caching Node.js:** [redis.io/docs/clients/nodejs/](https://www.google.com/search?q=https://redis.io/docs/clients/nodejs/)