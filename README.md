# SatyaBot

SatyaBot is a comprehensive fact-checking platform for India, integrating advanced LLMs (like Gemini/Groq), third-party APIs (Wikipedia, GDELT, Google News), and a Chrome Extension to quickly verify claims, news, and media.

## Project Structure
- `satyabot-backend/`: The Node.js/Express backend that handles API integrations, webhook requests, and AI verifications.
- `satyabot-extension/`: The Chrome extension UI to quickly fetch and display verification results to the user.

## Running the Project Locally

To fully run the system, you will need to run 4 distinct processes simultaneously. 

### Prerequisites
1. Clone the repository to your local machine.
2. Navigate to the `satyabot-backend/` directory.
3. Install dependencies by running `npm install`.
4. Create a `.env` file in the `satyabot-backend/` directory (see Environment Variables section below).

### Starting the Services (4 Simultaneous Processes)

You will need to open four separate terminal windows and run the following commands, one in each terminal. Ensure you are in the `satyabot-backend/` directory for all Node.js commands.

**Terminal 1: Main Backend Server**
```bash
npm run dev
```

**Terminal 2: WhatsApp Bot Webhook Server**
```bash
node backend-wtsp.js
```

**Terminal 3: Telegram Bot Server**
```bash
node telegram-bot.js
```

**Terminal 4: Ngrok Tunnel**
You will need Ngrok to expose your local port (5000) to the internet so that webhooks from Telegram and Twilio (WhatsApp) can reach your local development environment.
```bash
ngrok http 5000
```
*Note: After starting Ngrok, remember to update the webhook URLs in your Twilio console and Telegram bot configuration to use the newly generated Ngrok HTTPS URL.*

### Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode" in the top right corner.
3. Click "Load unpacked" and select the `satyabot-extension/` directory.

## Environment Variables

Create a `.env` file in the `satyabot-backend/` directory using the following sample configuration. **Do not commit actual API keys to source control.**

```env
# Server Configuration
PORT=5000
SERVER_PORT=8001
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/satyabot
MONGODB_TEST_URI=mongodb://localhost:27017/satyabot_test

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
CACHE_TTL=3600

# GROQ / LLM API
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
LLM_MODEL=llama-3.3-70b-versatile
LLM_MAX_TOKENS=500
LLM_TIMEOUT=15000

# News / Third-Party APIs
NEWS_API_KEY=your_news_api_key_here
GDELT_API_ENDPOINT=https://api.gdeltproject.org/api/v2/doc/doc
GOOGLE_NEWS_API=https://newsapi.org/v2/everything
GEMINI_API_KEY=your_gemini_api_key_here

# Twilio/WhatsApp (Optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
WHATSAPP_NUMBER=

# Security
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Admin Dashboard
ADMIN_SECRET_KEY=mySuperSecret123!
```
