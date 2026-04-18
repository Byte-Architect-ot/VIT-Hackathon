const FactCheckRecord = require('../models/FactCheckRecord');
const logger = require('../utils/logger');

class DatasetService {
    async searchSimilarClaims(claimText, limit = 5) {
    try {
      
      const results = await FactCheckRecord.find(
        { 
          $text: { $search: claimText },
          trustScore: { $gte: 75 }
        },
        { 
          score: { $meta: 'textScore' } 
        }
      )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit);
      
      return results;
    } catch (error) {
      logger.error('Dataset search error:', error.message);
      return [];
    }
  }

    async getClaimsByRegion(region, limit = 10) {
    return await FactCheckRecord.find({ region })
      .sort({ publishDate: -1 })
      .limit(limit);
  }

    async getDatasetStats() {
    const [total, byLabel, bySource, byRegion] = await Promise.all([
      FactCheckRecord.countDocuments(),
      
      FactCheckRecord.aggregate([
        {
          $group: {
            _id: '$label',
            count: { $sum: 1 }
          }
        }
      ]),
      
      FactCheckRecord.aggregate([
        {
          $group: {
            _id: '$factCheckSource',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      
      FactCheckRecord.aggregate([
        {
          $group: {
            _id: '$region',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);
    
    return {
      total,
      byLabel,
      bySource,
      byRegion
    };
  }

    async recordUsage(recordId) {
    try {
      const record = await FactCheckRecord.findById(recordId);
      if (record) {
        await record.recordUsage();
      }
    } catch (error) {
      logger.error('Record usage tracking error:', error.message);
    }
  }
}

module.exports = new DatasetService();