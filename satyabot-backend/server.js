require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { connectDB } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');

const webhookRoutes = require('./src/routes/webhook.routes');
const verificationRoutes = require('./src/routes/verification.routes');
const adminRoutes = require('./src/routes/admin.routes');

const app = express();
const PORT = process.env.SERVER_PORT || 8001;

app.use(helmet()); 
app.use(cors()); 
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

app.use('/api/webhook', webhookRoutes);
app.use('/api/verify', verificationRoutes);
app.use('/api/admin', adminRoutes);

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
    logger.info(' MongoDB connected successfully');

    await connectRedis();
    logger.info(' Redis connected successfully');

    app.listen(PORT, () => {
      logger.info(` SatyaBot server running on port ${PORT}`);
      logger.info(` Environment: ${process.env.NODE_ENV}`);
      logger.info(` Health Check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error(' Server startup failed:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

startServer();

module.exports = app; 