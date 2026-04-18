const verificationController = require('./verificationController');
const logger = require('../utils/logger');

class WebhookController {
    async handleWhatsApp(req, res, next) {
    try {
      const { Body, From, ProfileName } = req.body;
      
      logger.info(`WhatsApp message from ${From}: ${Body}`);

      if (!Body) {
        return res.status(200).send('OK'); 
      }

      const verificationRequest = {
        body: {
          text: Body,
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
      
      logger.info(`Sending WhatsApp response: ${responseMessage}`);

      res.status(200).send(responseMessage);

    } catch (error) {
      logger.error('WhatsApp webhook error:', error);
      res.status(200).send('️ System busy. Please try again in a moment.');
    }
  }

    _formatWhatsAppResponse(result) {
    if (!result) {
      return '️ Unable to verify at this time. Please check official sources.';
    }

    const statusEmoji = {
      'FAKE': '',
      'TRUE': '',
      'UNVERIFIED': ''
    };

    return `
${statusEmoji[result.status]} *${result.status}*
विश्वास स्कोर: ${result.confidence_score}%

 *दावा:* ${result.core_claim_extracted}

${result.explanation_hindi}

 *सुझाव:* ${result.suggested_action}

---
 SatyaBot | सत्यापित किया गया ${result.cached ? '(कैश)' : ''}
    `.trim();
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