const express = require('express');
const router = express.Router();
const localOcrService = require('../services/localOcrService');
const multer = require('multer');
const logger = require('../utils/logger');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

router.post('/extract', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image file provided',
        message: 'Please upload an image file'
      });
    }

    logger.info(`OCR request received, file size: ${req.file.size} bytes`);

    const result = await localOcrService.extractText(req.file.buffer);

    res.status(200).json({
      success: result.success,
      text: result.text,
      confidence: result.confidence,
      wordCount: result.wordCount,
      processingTime: result.processingTime,
      languages: result.languages
    });

  } catch (error) {
    logger.error('OCR endpoint error:', error);
    next(error);
  }
});

router.get('/stats', (req, res) => {
  const stats = localOcrService.getStats();
  res.status(200).json(stats);
});

module.exports = router;