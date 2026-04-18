const express = require('express');
const router = express.Router();
const verificationController = require('../controllers/verificationController');
const rateLimiter = require('../middleware/rateLimiter');

router.use(rateLimiter);

router.post('/', verificationController.verify.bind(verificationController));
router.post('/dataset', verificationController.verifyWithDataset.bind(verificationController));

module.exports = router;