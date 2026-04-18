require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');

const BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:5000/api';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = process.env.PORT || 8080;

const app = express();

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'SatyaBot Telegram is running', 
    timestamp: new Date(),
    backendConnected: BACKEND_API,
    stats: stats
  });
});

app.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
  console.log(`Connected to backend: ${BACKEND_API}`);
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const GREETINGS = ['/start', 'hi', 'hello', 'hey', 'namaste', 'namaskar', 'नमस्ते'];

let stats = {
  totalMessages: 0,
  textMessages: 0,
  imageMessages: 0,
  errors: 0,
  lastMessage: null,
  averageProcessingTime: 0
};

const CREDIBILITY_LEVELS = {
  HIGH: 80,
  MEDIUM: 60,
  LOW: 40
};

function isGreeting(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase().trim();
  return GREETINGS.some(greeting => 
    lowerText === greeting || lowerText.startsWith(greeting + ' ')
  );
}

function calculateCredibilityScore(result, metadata = {}) {
  let baseScore = result.confidence_score || 50;

  if (result.source === 'verified_dataset') {
    baseScore = Math.min(baseScore + 15, 100);
  }

  if (result.cached) {
    baseScore = Math.min(baseScore + 10, 100);
  }

  if (metadata.ocrConfidence !== null && metadata.ocrConfidence !== undefined) {
    if (metadata.ocrConfidence < 70) {
      baseScore = Math.max(baseScore - 10, 0);
    }
  }

    return Math.round(baseScore);
}

function getCredibilityLevel(score) {
  if (score >= CREDIBILITY_LEVELS.HIGH) return 'High';
  if (score >= CREDIBILITY_LEVELS.MEDIUM) return 'Medium';
  if (score >= CREDIBILITY_LEVELS.LOW) return 'Low';
  return 'Very Low';
}

function formatResponse(result, metadata = {}) {
  if (!result || !result.status) {
    return 'Unable to verify at this time. Please check official government sources.';
  }

  const statusEmoji = {
    'FAKE': '',
    'TRUE': '',
    'UNVERIFIED': ''
  };

  const emoji = statusEmoji[result.status] || '';

  const credibilityScore = calculateCredibilityScore(result, metadata);
  const credibilityLevel = getCredibilityLevel(credibilityScore);

  let report = '';

  report += `${emoji} *VERDICT: ${result.status}*\n`;
  report += `Credibility Score: ${credibilityScore}% (${credibilityLevel})\n\n`;

  if (result.core_claim_extracted && result.core_claim_extracted.length > 0) {
    report += `*Claim:* ${result.core_claim_extracted}\n\n`;
  }

  if (result.explanation_english) {
    report += `${result.explanation_english}\n\n`;
  }

  if (result.suggested_action) {
    report += `*Recommended Action:* ${result.suggested_action}\n\n`;
  }

  if (result.source === 'verified_dataset' && result.fact_check_link) {
    report += `*Source:* Verified fact-check database\n`;
    report += `*Reference:* ${result.fact_check_link}\n\n`;
  } else if (result.source === 'verified_dataset') {
    report += `*Source:* Verified fact-check database (Alt News, Boom Live, PIB)\n\n`;
  }

  if (result.cached) {
    report += `_Note: Previously verified claim_\n`;
  } else if (result.processingTime) {
    report += `_Verified in ${(result.processingTime / 1000).toFixed(1)}s_\n`;
  }

  if (metadata.ocrConfidence !== null && metadata.ocrConfidence !== undefined) {
    report += `_OCR Confidence: ${metadata.ocrConfidence.toFixed(0)}%`;
    if (metadata.ocrConfidence < 70) {
      report += ` (Low - results may vary)`;
    }
    report += `_\n`;
  }

  if (result.status === 'FAKE' && credibilityScore >= CREDIBILITY_LEVELS.MEDIUM) {
    report += `\n *WARNING:* This appears to be misinformation. Do not forward without verification.`;
  }

  report += `\n\n- SatyaBot Verification Service`;

  return report;
}

async function verifyText(text, userId) {
  try {
    console.log(`Verifying text for user ${userId}: ${text.substring(0, 50)}...`);

    const response = await axios.post(`${BACKEND_API}/verify/dataset`, {
      text: text,
      userId: userId.toString(),
      location: null
    }, {
      timeout: 30000
    });

    return response.data;

  } catch (error) {
    console.error('Backend verification error:', error.message);

        if (error.response) {
      console.error('Error response:', error.response.data);
    }

        throw error;
  }
}

async function processImage(imageBuffer, caption, userId) {
  try {
    console.log(`Processing image for user ${userId}, size: ${imageBuffer.length} bytes`);

    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: 'telegram-image.jpg',
      contentType: 'image/jpeg'
    });

    const ocrResponse = await axios.post(`${BACKEND_API}/ocr/extract`, formData, {
      headers: formData.getHeaders(),
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024
    });

    const ocrResult = ocrResponse.data;

    console.log(`OCR completed: ${ocrResult.success}, confidence: ${ocrResult.confidence}%`);

        if (ocrResult.text) {
      console.log(`Extracted text (first 100 chars): "${ocrResult.text.substring(0, 100)}..."`);
    }

    if (!ocrResult.success || !ocrResult.text || ocrResult.text.trim().length < 10) {
      return {
        success: false,
        message: 'Could not extract text from image. Please send a clearer image or type the text.'
      };
    }

    if (ocrResult.confidence < 40) {
      return {
        success: false,
        message: `Text extraction confidence too low (${ocrResult.confidence.toFixed(0)}%). Please send a clearer image or type the text manually.`
      };
    }

    let textToVerify = ocrResult.text;
    if (caption && caption.trim().length > 0 && !isGreeting(caption)) {
      textToVerify = `${caption}\n\n${ocrResult.text}`;
    }

    const verificationResult = await verifyText(textToVerify, userId);

    return {
      success: true,
      result: verificationResult,
      metadata: {
        ocrConfidence: ocrResult.confidence,
        processingTime: ocrResult.processingTime,
        wordCount: ocrResult.wordCount
      }
    };

  } catch (error) {
    console.error('Image processing error:', error.message);

        return {
      success: false,
      message: 'Failed to process image. Please try again or send the text directly.'
    };
  }
}

async function downloadTelegramImage(photo) {
  try {
    const fileLink = await bot.getFileLink(photo.file_id);

        const response = await axios.get(fileLink, {
      responseType: 'arraybuffer',
      timeout: 15000
    });

    return Buffer.from(response.data);

  } catch (error) {
    console.error('Image download error:', error);
    throw new Error('Failed to download image from Telegram');
  }
}

function updateAverageProcessingTime(newTime) {
  const totalProcessed = stats.textMessages + stats.imageMessages;
  if (totalProcessed > 0) {
    stats.averageProcessingTime = 
      ((stats.averageProcessingTime * (totalProcessed - 1)) + newTime) / totalProcessed;
  } else {
    stats.averageProcessingTime = newTime;
  }
}

bot.on('message', async (msg) => {
  const startTime = Date.now();
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageText = msg.text || msg.caption || '';
  const hasImage = msg.photo && msg.photo.length > 0;
  const hasDocument = msg.document && msg.document.mime_type?.startsWith('image/');

  stats.totalMessages++;
  stats.lastMessage = new Date().toISOString();

  console.log('='.repeat(60));
  console.log(`New Telegram message from ${userId} (chat: ${chatId})`);
  console.log(`Text: "${messageText || '[No text]'}"`);
  console.log(`Has image: ${hasImage || hasDocument}`);
  console.log('='.repeat(60));

  if (isGreeting(messageText) && !hasImage && !hasDocument) {
    const welcomeMessage = 
      `Welcome to *SatyaBot* - AI-Powered Fact-Checking Service\n\n` +
      `I can verify:\n` +
      `• Suspicious text messages\n` +
      `• Screenshots of news\n` +
      `• WhatsApp forwards\n` +
      `• Social media posts\n\n` +
      `Simply send me the text or image, and I will analyze it using verified databases and AI.\n\n` +
      `_Powered by verified fact-check databases + Groq AI_`;

    return bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
  }

  if (messageText === '/stats') {
    const statsMessage = 
      `*SatyaBot Statistics*\n\n` +
      `Total messages: ${stats.totalMessages}\n` +
      `Text verifications: ${stats.textMessages}\n` +
      `Image verifications: ${stats.imageMessages}\n` +
      `Errors: ${stats.errors}\n` +
      `Avg processing time: ${stats.averageProcessingTime.toFixed(2)}ms`;

    return bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
  }

  if (!messageText && !hasImage && !hasDocument) {
    return bot.sendMessage(
      chatId, 
      'Please send me text or an image to fact-check.'
    );
  }

  try {
    await bot.sendChatAction(chatId, 'typing');

    let result;
    let metadata = {};

    if (hasImage || hasDocument) {
      stats.imageMessages++;

      const photo = hasImage 
        ? msg.photo[msg.photo.length - 1] 
        : msg.document;

      console.log('Downloading Telegram image...');
      const imageBuffer = await downloadTelegramImage(photo);
      console.log(`Image downloaded: ${imageBuffer.length} bytes`);

      const imageResult = await processImage(imageBuffer, messageText, userId);

      if (!imageResult.success) {
        return bot.sendMessage(chatId, imageResult.message);
      }

      result = imageResult.result;
      metadata = imageResult.metadata;

    } else {
      stats.textMessages++;

      result = await verifyText(messageText, userId);
    }

    if (!result || !result.status) {
      throw new Error('Invalid verification result from backend');
    }

    const processingTime = Date.now() - startTime;
    console.log(`Verification completed in ${processingTime}ms`);
    updateAverageProcessingTime(processingTime);

    const responseText = formatResponse(result, metadata);
    await bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error processing message:', error);
    stats.errors++;

    let errorMessage = 'Sorry, I encountered an error. ';

    if (error.code === 'ECONNREFUSED') {
      errorMessage += 'Backend server is not reachable. Please contact support.';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage += 'Request timed out. Please try again.';
    } else if (error.message.includes('Invalid verification result')) {
      errorMessage += 'Received invalid response. Please try again.';
    } else {
      errorMessage += 'Please try again in a few moments.';
    }

    await bot.sendMessage(chatId, errorMessage);
  }
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code, error.message);
});

bot.on('error', (error) => {
  console.error('Bot error:', error);
});

process.on('SIGINT', () => {
  console.log('\nShutting down SatyaBot Telegram...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down SatyaBot Telegram...');
  bot.stopPolling();
  process.exit(0);
});

console.log('='.repeat(60));
console.log('SatyaBot Telegram Bot');
console.log('='.repeat(60));
console.log('Status: Running');
console.log(`Backend: ${BACKEND_API}`);
console.log(`Health: http://localhost:${PORT}/health`);
console.log('='.repeat(60));
console.log('Waiting for messages...');