const Claim = require('../models/Claim');
const Verification = require('../models/Verification');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

class AdminController {
    async getTrending(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 10;

      const redisTrending = await cacheService.getTrending(limit);

      const trending = await Promise.all(
        redisTrending.map(async (item) => {
          const claim = await Claim.findOne({ claimHash: item.claimHash });

                    if (claim) {
            return {
              claimHash: item.claimHash,
              extractedClaim: claim.extractedClaim,
              status: claim.status,
              queryCount: item.queryCount,
              velocityScore: claim.velocityScore,
              confidenceScore: claim.confidenceScore,
              lastQueried: claim.lastQueried,
              regions: claim.regions
            };
          }

                    return null;
        })
      );

      const validTrending = trending.filter(item => item !== null);

      res.status(200).json({
        success: true,
        count: validTrending.length,
        data: validTrending,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Get trending error:', error);
      next(error);
    }
  }

    async getStats(req, res, next) {
    try {
      const [
        totalClaims,
        totalVerifications,
        fakeClaims,
        trueClaims,
        unverifiedClaims,
        recentVerifications
      ] = await Promise.all([
        Claim.countDocuments(),
        Verification.countDocuments(),
        Claim.countDocuments({ status: 'FAKE' }),
        Claim.countDocuments({ status: 'TRUE' }),
        Claim.countDocuments({ status: 'UNVERIFIED' }),
        Verification.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .select('processingTime cacheHit createdAt')
      ]);

      const avgProcessingTime = recentVerifications.reduce(
        (sum, v) => sum + v.processingTime, 0
      ) / (recentVerifications.length || 1);

      const cacheHits = recentVerifications.filter(v => v.cacheHit).length;
      const cacheHitRate = (cacheHits / (recentVerifications.length || 1)) * 100;

      res.status(200).json({
        success: true,
        data: {
          totalClaims,
          totalVerifications,
          breakdown: {
            fake: fakeClaims,
            true: trueClaims,
            unverified: unverifiedClaims
          },
          performance: {
            avgProcessingTimeMs: Math.round(avgProcessingTime),
            cacheHitRate: Math.round(cacheHitRate)
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Get stats error:', error);
      next(error);
    }
  }

    async getClusters(req, res, next) {
    try {
      const clusters = await Claim.aggregate([
        {
          $group: {
            _id: '$clusterGroup',
            count: { $sum: 1 },
            totalQueries: { $sum: '$queryCount' },
            status: { $first: '$status' },
            sampleClaim: { $first: '$extractedClaim' },
            regions: { $addToSet: '$regions' }
          }
        },
        {
          $match: {
            count: { $gt: 1 } 
          }
        },
        {
          $sort: { totalQueries: -1 }
        },
        {
          $limit: 20
        }
      ]);

      res.status(200).json({
        success: true,
        count: clusters.length,
        data: clusters
      });

    } catch (error) {
      logger.error('Get clusters error:', error);
      next(error);
    }
  }

    async getHeatmap(req, res, next) {
    try {
      const heatmapData = await Claim.aggregate([
        {
          $unwind: '$regions'
        },
        {
          $group: {
            _id: {
              region: '$regions',
              status: '$status'
            },
            count: { $sum: '$queryCount' }
          }
        },
        {
          $group: {
            _id: '$_id.region',
            statuses: {
              $push: {
                status: '$_id.status',
                count: '$count'
              }
            },
            totalQueries: { $sum: '$count' }
          }
        },
        {
          $sort: { totalQueries: -1 }
        }
      ]);

      res.status(200).json({
        success: true,
        data: heatmapData
      });

    } catch (error) {
      logger.error('Get heatmap error:', error);
      next(error);
    }
  }
}

module.exports = new AdminController();