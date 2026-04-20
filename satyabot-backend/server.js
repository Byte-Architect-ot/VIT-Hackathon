require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const localOcrService = require('./src/services/localOcrService');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');
const ocrRoutes = require('./src/routes/ocr.routes');
const webhookRoutes = require('./src/routes/webhook.routes');
const verificationRoutes = require('./src/routes/verification.routes');
const adminRoutes = require('./src/routes/admin.routes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  const ocrStats = localOcrService.getStats();

    res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      ocr: ocrStats
    }
  });
});

app.use('/api/webhook', webhookRoutes);
app.post('/webhook', require('./src/controllers/webhookController').handleWhatsApp.bind(require('./src/controllers/webhookController')));
app.use('/api/verify', verificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ocr', ocrRoutes);
app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path
  });
});

const startServer = async () => {
  try {
    await connectDB();
    logger.info('MongoDB connected successfully');

    await connectRedis();
    logger.info('Redis connected successfully');

    await localOcrService.initialize();
    logger.info('OCR Service initialized successfully');

    app.listen(PORT, () => {
      logger.info(`SatyaBot server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Health Check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
};

const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');

  await localOcrService.shutdown();

    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();

module.exports = app;