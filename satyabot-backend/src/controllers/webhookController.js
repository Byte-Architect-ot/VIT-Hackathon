const verificationController = require('./verificationController');
const localOcrService = require('../services/localOcrService');
const logger = require('../utils/logger');
const axios = require('axios');

class WebhookController {
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

              return res.status(200).send(warningMsg);
            }

          } else {
            logger.warn(`OCR failed: ${ocrResult.error || 'Unknown error'}`);

            const errorMsg = this._formatWhatsAppMessage({
              title: 'Image Processing Failed',
              body: 'Unable to extract text from the image. Please ensure:\n\n• Image contains clear, readable text\n• Text is in English or Hindi\n• Image is not too blurry or small\n\nAlternatively, please type or forward the text directly.',
              footer: 'SatyaBot - Fact Verification Service'
            });

            return res.status(200).send(errorMsg);
          }

        } catch (error) {
          logger.error('Image processing error:', error);

          const errorMsg = this._formatWhatsAppMessage({
            title: 'Technical Error',
            body: 'Failed to process the image due to a technical issue. Please try again or send the text manually.',
            footer: 'Error code: IMG_PROC_ERR'
          });

          return res.status(200).send(errorMsg);
        }
      }

      if (!textToVerify || textToVerify.trim().length < 10) {
        const helpMsg = this._formatWhatsAppMessage({
          title: 'Welcome to SatyaBot',
          body: 'I am an automated fact-checking service. Send me:\n\n• Suspicious messages or forwards\n• Screenshots of news/social media posts\n• Claims you want to verify\n\nI will analyze and verify the information using trusted sources and AI.',
          footer: 'Powered by verified fact-check databases'
        });

        return res.status(200).send(helpMsg);
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

      await verificationController.verify(verificationRequest, mockRes, next);

      const responseMessage = this._formatWhatsAppResponse(verificationResult);

      logger.info('Sending WhatsApp response');

      res.status(200).send(responseMessage);

    } catch (error) {
      logger.error('WhatsApp webhook error:', error);

      const errorMsg = this._formatWhatsAppMessage({
        title: 'Service Temporarily Unavailable',
        body: 'Our fact-checking service is experiencing high traffic. Please try again in a few moments.',
        footer: 'We apologize for the inconvenience.'
      });

      res.status(200).send(errorMsg);
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

    const statusInfo = {
      'FAKE': {
        verdict: 'MISINFORMATION DETECTED',
        icon: '',
        severity: 'HIGH PRIORITY ALERT'
      },
      'TRUE': {
        verdict: 'VERIFIED AS ACCURATE',
        icon: '',
        severity: 'CONFIRMED'
      },
      'UNVERIFIED': {
        verdict: 'INSUFFICIENT EVIDENCE',
        icon: '',
        severity: 'REQUIRES CAUTION'
      }
    };

    const status = statusInfo[result.status] || statusInfo['UNVERIFIED'];

    let report = '';

    report += `FACT-CHECK VERIFICATION REPORT\n`;

    report += `VERDICT: ${status.icon} ${status.verdict}\n`;
    report += `Classification: ${status.severity}\n`;
    report += `Confidence Level: ${result.confidence_score}%\n\n`;

    report += `CLAIM ANALYZED:\n`;
    report += `${result.core_claim_extracted}\n\n`;

    report += `FINDINGS:\n`;
    report += `${result.explanation_english}\n\n`;


    report += `RECOMMENDED ACTION:\n`;
    report += `${result.suggested_action}\n\n`;

    if (result.source === 'verified_dataset') {
      report += `SOURCE:\n`;
      report += `Verified through established fact-check database (Alt News, Boom Live, PIB Fact Check)\n\n`;
    } else if (result.trustedContext && result.trustedContext.length > 0) {
      report += `SOURCES CONSULTED:\n`;
      result.trustedContext.slice(0, 2).forEach((source, index) => {
        report += `${index + 1}. ${source.source}\n`;
      });
      report += `\n`;
    }

    if (result.cached) {
      report += `Database Reference: Previously verified claim\n`;
    } else {
      report += `Real-time Analysis: Completed in ${(result.processingTime / 1000).toFixed(1)}s\n`;
    }

    report += `SatyaBot Fact-Checking Service\n`;
    report += `Powered by AI + Verified Databases\n`;
    report += `Report ID: ${Date.now().toString(36)}\n`;

    if (result.status === 'FAKE') {
      report += `\n IMPORTANT: Do not forward this message without this fact-check report. Spreading misinformation may have legal consequences.\n`;
    }

    return report;
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

      await verificationController.verify(verificationRequest, mockRes, next);

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

    const statusInfo = {
      'FAKE': { icon: '', label: 'MISINFORMATION' },
      'TRUE': { icon: '', label: 'VERIFIED' },
      'UNVERIFIED': { icon: '', label: 'UNCONFIRMED' }
    };

    const status = statusInfo[result.status] || statusInfo['UNVERIFIED'];

    let report = '';

    report += `━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `*FACT-CHECK REPORT*\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    report += `*Verdict:* ${status.icon} ${status.label}\n`;
    report += `*Confidence:* ${result.confidence_score}%\n\n`;

    report += `*Claim Analyzed:*\n`;
    report += `${result.core_claim_extracted}\n\n`;

    report += `*Findings:*\n`;
    report += `${result.explanation_english}\n\n`;

    if (result.explanation_hindi) {
      report += `*विवरण:*\n`;
      report += `${result.explanation_hindi}\n\n`;
    }

    report += `*Recommended Action:*\n`;
    report += `${result.suggested_action}\n\n`;

    if (result.source === 'verified_dataset') {
      report += `*Source:* Verified fact-check database\n`;
    }

    report += `━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `_SatyaBot Verification Service_\n`;
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