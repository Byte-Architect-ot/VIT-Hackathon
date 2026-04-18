const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

router.post('/whatsapp', webhookController.handleWhatsApp.bind(webhookController));

router.get('/whatsapp', webhookController.verifyWebhook.bind(webhookController));

module.exports = router;