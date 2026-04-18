# SatyaBot

SatyaBot is a comprehensive fact-checking platform for India, integrating advanced LLMs (like Gemini/Groq), third-party APIs (Wikipedia, GDELT, Google News), and a Chrome Extension to quickly verify claims, news, and media.

## Project Structure
- `satyabot-backend/`: The Node.js/Express backend that handles API integrations, webhook requests, and AI verifications.
- `satyabot-extension/`: The Chrome extension UI to quickly fetch and display verification results to the user.

## Getting Started

1. Clone the repository.
2. Navigate to `satyabot-backend/` and run `npm install`.
3. Set up the `.env` file (see sample below).
4. Run `npm run dev` to start the backend.
5. Load the unpacked extension in Chrome from the `satyabot-extension/` folder.

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
