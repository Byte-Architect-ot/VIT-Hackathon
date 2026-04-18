require('dotenv').config();
const { connectDB } = require('../config/database');
const FactCheckRecord = require('../models/FactCheckRecord');
const logger = require('../utils/logger');

class DatasetAnalyzer {
  async analyze() {
    try {
      await connectDB();
      
      logger.info(' Analyzing Fact-Check Dataset...\n');
      
      const totalRecords = await FactCheckRecord.countDocuments();
      logger.info(`Total Records: ${totalRecords}\n`);
      
      await this.analyzeLabelDistribution();
      
      await this.analyzeSourceDistribution();
      
      await this.analyzeRegionalDistribution();
      
      await this.analyzePlatformDistribution();
      
      await this.analyzeCategoryDistribution();
      
      await this.analyzeLanguageDistribution();
      
      await this.analyzeContentTypes();
      
      await this.analyzeTopKeywords();
      
      process.exit(0);
    } catch (error) {
      logger.error('Analysis failed:', error);
      process.exit(1);
    }
  }

  async analyzeLabelDistribution() {
    const distribution = await FactCheckRecord.aggregate([
      {
        $group: {
          _id: '$label',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    logger.info(' LABEL DISTRIBUTION:');
    distribution.forEach(item => {
      logger.info(`  ${item._id}: ${item.count}`);
    });
    logger.info('');
  }

  async analyzeSourceDistribution() {
    const distribution = await FactCheckRecord.aggregate([
      {
        $group: {
          _id: '$factCheckSource',
          count: { $sum: 1 },
          avgTrustScore: { $avg: '$trustScore' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    logger.info(' TOP FACT-CHECK SOURCES:');
    distribution.forEach(item => {
      logger.info(`  ${item._id}: ${item.count} (Trust: ${item.avgTrustScore.toFixed(1)})`);
    });
    logger.info('');
  }

  async analyzeRegionalDistribution() {
    const distribution = await FactCheckRecord.aggregate([
      {
        $group: {
          _id: '$region',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    logger.info('️  TOP REGIONS:');
    distribution.forEach(item => {
      logger.info(`  ${item._id}: ${item.count}`);
    });
    logger.info('');
  }

  async analyzePlatformDistribution() {
    const distribution = await FactCheckRecord.aggregate([
      {
        $group: {
          _id: '$platform',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    logger.info(' PLATFORM DISTRIBUTION:');
    distribution.forEach(item => {
      logger.info(`  ${item._id}: ${item.count}`);
    });
    logger.info('');
  }

  async analyzeCategoryDistribution() {
    const distribution = await FactCheckRecord.aggregate([
      {
        $group: {
          _id: '$newsCategory',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    logger.info(' TOP CATEGORIES:');
    distribution.forEach(item => {
      logger.info(`  ${item._id}: ${item.count}`);
    });
    logger.info('');
  }

  async analyzeLanguageDistribution() {
    const distribution = await FactCheckRecord.aggregate([
      {
        $group: {
          _id: '$language',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    logger.info(' LANGUAGE DISTRIBUTION:');
    distribution.forEach(item => {
      logger.info(`  ${item._id}: ${item.count}`);
    });
    logger.info('');
  }

  async analyzeContentTypes() {
    const text = await FactCheckRecord.countDocuments({ 'contentType.text': true });
    const video = await FactCheckRecord.countDocuments({ 'contentType.video': true });
    const image = await FactCheckRecord.countDocuments({ 'contentType.image': true });
    
    logger.info(' CONTENT TYPES:');
    logger.info(`  Text: ${text}`);
    logger.info(`  Video: ${video}`);
    logger.info(`  Image: ${image}`);
    logger.info('');
  }

  async analyzeTopKeywords() {
    const keywords = await FactCheckRecord.aggregate([
      { $unwind: '$extractedKeywords' },
      {
        $group: {
          _id: '$extractedKeywords',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    
    logger.info(' TOP KEYWORDS:');
    keywords.forEach((item, index) => {
      logger.info(`  ${index + 1}. ${item._id}: ${item.count}`);
    });
    logger.info('');
  }
}

const analyzer = new DatasetAnalyzer();
analyzer.analyze();