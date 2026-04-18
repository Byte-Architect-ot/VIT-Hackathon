const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const logger = require('../utils/logger');
const path = require('path');

class LocalOcrService {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.processingQueue = 0;
    this.maxQueueSize = 10;

    this.config = {
      languages: 'eng+hin', 
      tessedit_char_whitelist: null, 
      tessedit_pageseg_mode: Tesseract.PSM.AUTO, 
    };

    this.workerPool = {
      enabled: true,
      maxWorkers: 3,
      workers: []
    };
  }

  async initialize() {
    if (this.isInitialized) {
      logger.warn('OCR Service already initialized');
      return;
    }

    try {
      logger.info('Initializing Tesseract OCR worker...');

      this.worker = await Tesseract.createWorker(this.config.languages);

      this.isInitialized = true;
      logger.info('Tesseract OCR worker initialized successfully');
      logger.info(`Supported languages: ${this.config.languages}`);

          } catch (error) {
      logger.error('Failed to initialize Tesseract worker:', error);
      throw error;
    }
  }

  async preprocessImage(imageBuffer) {
    try {
      const processedBuffer = await sharp(imageBuffer)
        .greyscale() 
        .normalize() 
        .sharpen() 
        .resize(null, 2000, { 
          withoutEnlargement: true,
          fit: 'inside'
        })
        .toBuffer();

      logger.debug('Image preprocessing completed');
      return processedBuffer;

          } catch (error) {
      logger.warn('Image preprocessing failed, using original:', error.message);
      return imageBuffer;
    }
  }

  async extractText(imageBuffer, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.processingQueue >= this.maxQueueSize) {
      logger.warn('OCR queue full, rejecting request');
      return {
        text: '[OCR Service Busy - Please Retry]',
        confidence: 0,
        success: false,
        error: 'Queue full'
      };
    }

    this.processingQueue++;
    const startTime = Date.now();

    try {
      const processedImage = await this.preprocessImage(imageBuffer);

      logger.info('Starting OCR text extraction...');
      const result = await this.worker.recognize(processedImage);

      const processingTime = Date.now() - startTime;

      const extractedText = this.cleanExtractedText(result.data.text);
      const confidence = result.data.confidence || 0;

      logger.info(`OCR completed in ${processingTime}ms, confidence: ${confidence.toFixed(2)}%`);
      logger.info(`Extracted text length: ${extractedText.length} characters`);

      if (extractedText.length < 10 && confidence < 50) {
        logger.warn('Low confidence OCR result');
        return {
          text: '[OCR Failed - Image Unreadable]',
          confidence: confidence,
          success: false,
          processingTime,
          wordCount: 0
        };
      }

      return {
        text: extractedText,
        confidence: confidence,
        success: true,
        processingTime,
        wordCount: extractedText.split(/\s+/).length,
        languages: this.config.languages
      };

    } catch (error) {
      logger.error('OCR extraction failed:', error);

            return {
        text: '[OCR Failed]',
        confidence: 0,
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      };

          } finally {
      this.processingQueue--;
    }
  }

  cleanExtractedText(rawText) {
    if (!rawText) return '';

    return rawText
      .replace(/\s+/g, ' ') 
      .replace(/[^\u0000-\u007F\u0900-\u097F\s.,!?;:'"()-]/g, '') 
      .trim();
  }

  async extractTextFromUrl(imageUrl) {
    try {
      const axios = require('axios');

            logger.info(`Downloading image from URL: ${imageUrl}`);
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000
      });

      const imageBuffer = Buffer.from(response.data);
      return await this.extractText(imageBuffer);

          } catch (error) {
      logger.error('Failed to download image from URL:', error);
      return {
        text: '[Failed to Download Image]',
        confidence: 0,
        success: false,
        error: error.message
      };
    }
  }

  async extractTextBatch(imageBuffers) {
    logger.info(`Starting batch OCR for ${imageBuffers.length} images`);

        const results = await Promise.all(
      imageBuffers.map(async (buffer, index) => {
        try {
          const result = await this.extractText(buffer);
          return {
            index,
            ...result
          };
        } catch (error) {
          logger.error(`Batch OCR failed for image ${index}:`, error);
          return {
            index,
            text: '[OCR Failed]',
            success: false,
            error: error.message
          };
        }
      })
    );

    logger.info(`Batch OCR completed: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  async hasText(imageBuffer) {
    try {
      const metadata = await sharp(imageBuffer).metadata();

      if (metadata.width < 100 || metadata.height < 100) {
        return false; 
      }

      const sample = await sharp(imageBuffer)
        .resize(400, 400, { fit: 'inside' })
        .toBuffer();

      const result = await this.extractText(sample);
      return result.success && result.text.length > 5;

          } catch (error) {
      logger.error('Text detection failed:', error);
      return true; 
    }
  }

  getStats() {
    return {
      initialized: this.isInitialized,
      queueSize: this.processingQueue,
      maxQueueSize: this.maxQueueSize,
      languages: this.config.languages
    };
  }

  async shutdown() {
    if (this.worker) {
      logger.info('Shutting down Tesseract worker...');
      await this.worker.terminate();
      this.isInitialized = false;
      logger.info('Tesseract worker terminated');
    }
  }

  async reinitialize() {
    logger.warn('Reinitializing OCR worker...');
    await this.shutdown();
    await this.initialize();
  }
}

module.exports = new LocalOcrService();