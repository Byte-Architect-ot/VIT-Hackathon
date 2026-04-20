const verificationController = require('./verificationController');
const localOcrService = require('../services/localOcrService');
const logger = require('../utils/logger');
const axios = require('axios');

class WebhookController {
  constructor() {
    this.userSourcesCache = new Map();
  }

  async handleWhatsApp(req, res, next) {
    try {
      const {
        Body,
        From,
        ProfileName,
        MediaUrl0,
        MediaContentType0,
        NumMedia
      } = req.body;

      logger.info(`WhatsApp webhook received from ${From}`);
      logger.info(`Message body: ${Body || '[No text]'}`);
      logger.info(`Number of media: ${NumMedia}`);
      logger.info(`Media URL: ${MediaUrl0 || '[No media]'}`);

      let textToVerify = Body;
      const lowerText = (Body || "").trim().toLowerCase();

      // Handle 'sources' request
      if (lowerText === 'sources') {
        const sources = this.userSourcesCache.get(From);
        if (sources && sources.length > 0) {
          let srcMsg = `SOURCES (${sources.length} references):\n\n`;
          sources.forEach((src, i) => {
            const tier = (src.credibilityTier || 'unknown').charAt(0).toUpperCase() + (src.credibilityTier || 'unknown').slice(1);
            const title = src.title || src.source || 'Source';
            const domain = src.source || '';
            srcMsg += `${i + 1}. [${tier}] ${title}`;
            if (domain && domain !== title) {
              srcMsg += ` (${domain})`;
            }
            srcMsg += `\n`;
            if (src.url) {
              srcMsg += `   ${src.url}\n`;
            }
            srcMsg += `\n`;
          });
          return this.sendTwiML(res, srcMsg.trim());
        } else {
          return this.sendTwiML(res, 'No sources available. Please send a claim to verify first.');
        }
      }

      const hasMedia = NumMedia && parseInt(NumMedia) > 0;
      const isImage = MediaContentType0 && MediaContentType0.startsWith('image/');

      if (hasMedia && isImage && MediaUrl0) {
        logger.info('Processing image from WhatsApp...');

        try {
          const imageBuffer = await this.downloadTwilioMedia(MediaUrl0);

          logger.info(`Image downloaded, size: ${imageBuffer.length} bytes`);

          const ocrResult = await localOcrService.extractText(imageBuffer);

          logger.info(`OCR completed: success=${ocrResult.success}, confidence=${ocrResult.confidence}%`);
          logger.info(`Extracted text: ${ocrResult.text.substring(0, 100)}...`);

          if (ocrResult.success && ocrResult.text.length > 10) {
            textToVerify = ocrResult.text;

            if (Body && Body.trim().length > 0) {
              textToVerify = `${Body}\n\n[Text from image]: ${ocrResult.text}`;
            }

            if (ocrResult.confidence < 60) {
              const warningMsg = this._formatWhatsAppMessage({
                title: 'Low OCR Confidence Warning',
                body: `Text extracted from image with ${ocrResult.confidence.toFixed(0)}% confidence. Results may be inaccurate.\n\nExtracted text:\n${ocrResult.text}`,
                footer: 'For better results, send clearer images or type the text manually.'
              });

              return this.sendTwiML(res, warningMsg);
            }

          } else {
            logger.warn(`OCR failed: ${ocrResult.error || 'Unknown error'}`);

            const errorMsg = this._formatWhatsAppMessage({
              title: 'Image Processing Failed',
              body: 'Unable to extract text from the image. Please ensure:\n\n• Image contains clear, readable text\n• Text is in English or Hindi\n• Image is not too blurry or small\n\nAlternatively, please type or forward the text directly.',
              footer: 'SatyaBot - Fact Verification Service'
            });

            return this.sendTwiML(res, errorMsg);
          }

        } catch (error) {
          logger.error('Image processing error:', error);

          const errorMsg = this._formatWhatsAppMessage({
            title: 'Technical Error',
            body: 'Failed to process the image due to a technical issue. Please try again or send the text manually.',
            footer: 'Error code: IMG_PROC_ERR'
          });

          return this.sendTwiML(res, errorMsg);
        }
      }

      if (!textToVerify || textToVerify.trim().length < 10) {
        const helpMsg = this._formatWhatsAppMessage({
          title: 'Welcome to SatyaBot',
          body: 'I am an automated fact-checking service. Send me:\n\n• Suspicious messages or forwards\n• Screenshots of news/social media posts\n• Claims you want to verify\n\nI will analyze and verify the information using trusted sources and AI.',
          footer: 'Powered by verified fact-check databases'
        });

        return this.sendTwiML(res, helpMsg);
      }

      logger.info('Proceeding to verification...');

      const verificationRequest = {
        body: {
          text: textToVerify,
          userId: From,
          location: null
        }
      };

      let verificationResult;
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            verificationResult = data;
          }
        })
      };

      await verificationController.verifyWithDataset(verificationRequest, mockRes, next);

      if (verificationResult && verificationResult.sources && verificationResult.sources.length > 0) {
        this.userSourcesCache.set(From, verificationResult.sources);
      } else if (verificationResult && verificationResult.source === 'verified_dataset' && verificationResult.fact_check_link) {
        this.userSourcesCache.set(From, [{
          title: 'Verified Database Source',
          url: verificationResult.fact_check_link,
          credibilityTier: 'high'
        }]);
      }

      const responseMessage = this._formatWhatsAppResponse(verificationResult);

      logger.info('Sending WhatsApp response');

      this.sendTwiML(res, responseMessage);

    } catch (error) {
      logger.error('WhatsApp webhook error:', error);

      const errorMsg = this._formatWhatsAppMessage({
        title: 'Service Temporarily Unavailable',
        body: 'Our fact-checking service is experiencing high traffic. Please try again in a few moments.',
        footer: 'We apologize for the inconvenience.'
      });

      this.sendTwiML(res, errorMsg);
    }
  }

  async downloadTwilioMedia(mediaUrl) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (!accountSid || !authToken) {
        logger.warn('Twilio credentials not configured, attempting direct download');
        return await this.downloadImage(mediaUrl);
      }

      logger.info('Downloading Twilio media with auth...');

      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: 10 * 1024 * 1024,
        auth: {
          username: accountSid,
          password: authToken
        }
      });

      return Buffer.from(response.data);

    } catch (error) {
      logger.error('Twilio media download error:', error.message);

      logger.info('Attempting direct download without auth...');
      return await this.downloadImage(mediaUrl);
    }
  }

  async downloadImage(url) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxContentLength: 10 * 1024 * 1024
      });

      return Buffer.from(response.data);

    } catch (error) {
      logger.error('Image download failed:', error);
      throw new Error('Failed to download image');
    }
  }

  _formatWhatsAppResponse(result) {
    if (!result) {
      return this._formatWhatsAppMessage({
        title: 'Verification Unavailable',
        body: 'Unable to verify this claim at the moment. Please check official government sources or trusted news outlets.',
        footer: 'SatyaBot - Fact Verification Service'
      });
    }

    const statusLabels = {
      'FAKE': 'MISINFORMATION DETECTED',
      'TRUE': 'VERIFIED AS ACCURATE',
      'UNVERIFIED': 'INSUFFICIENT EVIDENCE',
      'OPINION': 'OPINION / SUBJECTIVE'
    };

    const verdict = statusLabels[result.status] || statusLabels['UNVERIFIED'];

    let report = `VERDICT: ${verdict}\n`;
    if (result.classification) {
      report += `Category: ${result.classification}\n`;
    }
    report += `\n`;

    if (result.core_claim_extracted) {
      report += `CLAIM: ${result.core_claim_extracted}\n\n`;
    }

    if (result.explanation_english) {
      report += `FINDINGS: ${result.explanation_english}\n\n`;
    }

    if (result.explanation_hindi) {
      report += `विवरण (Hindi): ${result.explanation_hindi}\n\n`;
    }

    if (result.suggested_action) {
      report += `ACTION: ${result.suggested_action}\n\n`;
    }

    const hasSources = (result.sources && result.sources.length > 0) || (result.source === 'verified_dataset' && result.fact_check_link);
    if (hasSources) {
      report += `Reply 'sources' to get fact-check references and links.\n\n`;
    }

    if (result.cached) {
        report += `Database: Previously verified claim\n`;
    } else {
        const time = result.processingTime ? `${(result.processingTime / 1000).toFixed(1)}s` : 'N/A';
        report += `Analysis Time: ${time}\n`;
    }

    if (result.status === 'FAKE') {
      report += `\nALERT: Do not forward this message. Spreading misinformation may have legal consequences under IT Act 2000.\n`;
    }

    return report.trim();
  }

  _formatWhatsAppMessage({ title, body, footer }) {
    let message = '';

    message += `${title.toUpperCase()}\n`;

        message += `${body}\n\n`;

    message += `${footer}\n`;

    return message;
  }

  async handleTelegram(req, res, next) {
    try {
      const { message } = req.body;

      if (!message) {
        return res.status(200).json({ ok: true });
      }

      const chatId = message.chat.id;
      const userId = message.from.id;

      let textToVerify = message.text;

      if (message.photo && message.photo.length > 0) {
        const photo = message.photo[message.photo.length - 1];

        logger.info(`Processing Telegram photo: ${photo.file_id}`);

        try {
          const fileUrl = await this.getTelegramFileUrl(photo.file_id);
          const imageBuffer = await this.downloadImage(fileUrl);
          const ocrResult = await localOcrService.extractText(imageBuffer);

          if (ocrResult.success) {
            textToVerify = ocrResult.text;

            if (message.caption) {
              textToVerify = `${message.caption}\n\n${ocrResult.text}`;
            }

            logger.info(`Telegram OCR confidence: ${ocrResult.confidence}%`);
          } else {
            await this.sendTelegramMessage(chatId, 'Could not extract text from image. Please send a clearer image or type the text.');
            return res.status(200).json({ ok: true });
          }

        } catch (error) {
          logger.error('Telegram image processing error:', error);
          await this.sendTelegramMessage(chatId, 'Failed to process image. Please try again.');
          return res.status(200).json({ ok: true });
        }
      }

      if (!textToVerify || textToVerify.trim().length === 0) {
        const welcomeMsg =
          '*SatyaBot Fact-Checking Service*\n\n' +
          'Send me any suspicious claim, news, or image to verify.\n\n' +
          'I analyze content using verified databases and AI.';

        await this.sendTelegramMessage(chatId, welcomeMsg);
        return res.status(200).json({ ok: true });
      }

      const verificationRequest = {
        body: {
          text: textToVerify,
          userId: userId.toString(),
          location: null
        }
      };

      let verificationResult;
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            verificationResult = data;
          }
        })
      };

      await verificationController.verifyWithDataset(verificationRequest, mockRes, next);

      const responseMessage = this._formatTelegramResponse(verificationResult);
      await this.sendTelegramMessage(chatId, responseMessage);

      res.status(200).json({ ok: true });

    } catch (error) {
      logger.error('Telegram webhook error:', error);
      res.status(200).json({ ok: true });
    }
  }

  _formatTelegramResponse(result) {
    if (!result) {
      return '*Verification Unavailable*\n\nUnable to verify at this time. Please check official sources.';
    }

    const statusLabels = {
      'FAKE': 'MISINFORMATION DETECTED',
      'TRUE': 'VERIFIED AS ACCURATE',
      'UNVERIFIED': 'INSUFFICIENT EVIDENCE',
      'OPINION': 'OPINION / SUBJECTIVE'
    };

    const verdict = statusLabels[result.status] || statusLabels['UNVERIFIED'];

    let report = '';

    report += `━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `*SATYABOT FACT-CHECK REPORT*\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    report += `*Verdict:* ${verdict}\n`;
    if (result.classification) {
      report += `*Category:* ${result.classification}\n`;
    }
    report += `\n`;

    if (result.core_claim_extracted) {
      report += `*Claim Analyzed:*\n`;
      report += `${result.core_claim_extracted}\n\n`;
    }

    if (result.explanation_english) {
      report += `*Findings:*\n`;
      report += `${result.explanation_english}\n\n`;
    }

    if (result.explanation_hindi) {
      report += `*विवरण (Hindi):*\n`;
      report += `${result.explanation_hindi}\n\n`;
    }

    if (result.suggested_action) {
      report += `*Recommended Action:*\n`;
      report += `${result.suggested_action}\n\n`;
    }

    if (result.source === 'verified_dataset' && result.fact_check_link) {
      report += `*Verified Source:* ${result.fact_check_link}\n\n`;
    }

    const sources = result.sources || [];
    if (sources.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `*Sources (${sources.length} references):*\n\n`;
      sources.forEach((src, i) => {
        const tier = (src.credibilityTier || 'unknown').charAt(0).toUpperCase() + (src.credibilityTier || 'unknown').slice(1);
        const title = src.title || src.source || 'Source';
        if (src.url) {
          report += `${i + 1}. [${title}](${src.url}) — ${tier}\n`;
        } else {
          report += `${i + 1}. ${title} — ${tier}\n`;
        }
      });
      report += `\n`;
    }

    report += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (result.cached) {
      report += `_Database: Previously verified claim_\n`;
    } else if (result.processingTime) {
      report += `_Real-time Analysis: Completed in ${(result.processingTime / 1000).toFixed(1)}s_\n`;
    }

    if (result.status === 'FAKE') {
      report += `\n*ALERT:* Do not forward this message. Spreading misinformation may have legal consequences.`;
    }

    report += `\n_SatyaBot Verification Service_\n`;
    report += `_Report: ${Date.now().toString(36)}_\n`;

    return report;
  }

  async getTelegramFileUrl(fileId) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    const fileResponse = await axios.get(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );

    const filePath = fileResponse.data.result.file_path;
    return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  }

  async sendTelegramMessage(chatId, text) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    });
  }

  sendTwiML(res, message) {
    const MAX_LEN = 1500;

    if (message.length <= MAX_LEN) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
<Message>${this.escapeXml(message)}</Message>
</Response>`;

      res.set('Content-Type', 'text/xml');
      return res.status(200).send(twiml);
    }

    // Split long messages into chunks at paragraph boundaries
    const chunks = this._splitMessage(message, MAX_LEN);
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>`;
    chunks.forEach(chunk => {
      twiml += `\n<Message>${this.escapeXml(chunk)}</Message>`;
    });
    twiml += `\n</Response>`;

    res.set('Content-Type', 'text/xml');
    res.status(200).send(twiml);
  }

  _splitMessage(text, maxLen) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > maxLen) {
      let splitAt = remaining.lastIndexOf('\n\n', maxLen);
      if (splitAt <= 0 || splitAt < maxLen * 0.3) {
        splitAt = remaining.lastIndexOf('\n', maxLen);
      }
      if (splitAt <= 0 || splitAt < maxLen * 0.3) {
        splitAt = maxLen;
      }
      chunks.push(remaining.substring(0, splitAt).trim());
      remaining = remaining.substring(splitAt).trim();
    }
    if (remaining.length > 0) {
      chunks.push(remaining.trim());
    }
    return chunks;
  }

  escapeXml(str = '') {
    return str.replace(/[<>&"']/g, (c) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;'
    }[c]));
  }

  verifyWebhook(req, res) {
    const { challenge } = req.query;

    if (challenge) {
      logger.info('Webhook verification successful');
      return res.status(200).send(challenge);
    }

    res.status(403).send('Forbidden');
  }
}

module.exports = new WebhookController();