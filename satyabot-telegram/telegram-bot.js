require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const axios = require('axios');

// Initialize Express for health check
const app = express();
const PORT = 8080;

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'SatyaBot Telegram is running', timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});

// Initialize Telegram Bot with Long Polling
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// System prompt for fact-checking
const SYSTEM_PROMPT = `You are SatyaBot, a highly accurate fact-checker for India. Analyze the input carefully. Return ONLY in this format:
*Status:* [FAKE / TRUE / UNVERIFIED]
*Fact Check:* [Short explanation in simple English or Hinglish]. Rules: Max 400 characters, be concise.`;

// Greeting keywords
const GREETINGS = ['/start', 'hi', 'hello', 'hey', 'namaste', 'namaskar'];

// Check if message is a greeting
function isGreeting(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase().trim();
  return GREETINGS.some(greeting => lowerText === greeting || lowerText.startsWith(greeting + ' '));
}

// Main message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text || msg.caption || '';
  const hasImage = msg.photo && msg.photo.length > 0;

  // Pre-filter: Handle greetings without images
  if (isGreeting(messageText) && !hasImage) {
    return bot.sendMessage(
      chatId,
      'Namaste! I am SatyaBot. Forward me any suspicious news, rumor, or image, and I will verify it for you.'
    );
  }

  // If no text and no image, ignore
  if (!messageText && !hasImage) {
    return bot.sendMessage(chatId, 'Please send text or an image to fact-check.');
  }

  try {
    // Show typing indicator
    await bot.sendChatAction(chatId, 'typing');

    let result;

    if (hasImage) {
      // Handle image with optional caption
      const photo = msg.photo[msg.photo.length - 1]; // Highest resolution
      const fileLink = await bot.getFileLink(photo.file_id);

      // Download image as arraybuffer
      const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
      const base64Image = Buffer.from(response.data).toString('base64');

      // Determine MIME type
      const mimeType = response.headers['content-type'] || 'image/jpeg';

      // Prepare multimodal input
      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: mimeType,
        },
      };

      const prompt = messageText
        ? `${SYSTEM_PROMPT}\n\nUser text: ${messageText}\n\nAnalyze the image and text together.`
        : `${SYSTEM_PROMPT}\n\nAnalyze this image for misinformation.`;

      result = await model.generateContent([prompt, imagePart]);
    } else {
      // Handle text-only
      const prompt = `${SYSTEM_PROMPT}\n\nUser input: ${messageText}`;
      result = await model.generateContent(prompt);
    }

    const factCheckResponse = result.response.text();

    // Send response with Markdown formatting
    await bot.sendMessage(chatId, factCheckResponse, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error processing message:', error);
    await bot.sendMessage(
      chatId,
      'SatyaBot is experiencing heavy traffic right now. Please try again in a few minutes.'
    );
  }
});

console.log('SatyaBot Telegram is running...');