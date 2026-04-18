require('dotenv').config();
const { connectDB } = require('../config/database');
const { connectRedis, getRedisClient } = require('../config/redis');
const FactCheckRecord = require('../models/FactCheckRecord');
const Claim = require('../models/Claim');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');
const { CACHE } = require('../config/constants');

class CacheSeeder {
  constructor() {
    this.stats = {
      processed: 0,
      cached: 0,
      migrated: 0,
      errors: 0
    };
  }

    async seed() {
    try {
      logger.info(' Starting cache seeding...');

            await connectDB();
      await connectRedis();

            const records = await FactCheckRecord.find({
        trustScore: { $gte: 80 },
        label: { $in: ['FALSE', 'TRUE'] }
      }).limit(5000);

            logger.info(`Found ${records.length} high-quality records to seed`);

            for (const record of records) {
        await this.processRecord(record);
        this.stats.processed++;

                if (this.stats.processed % 100 === 0) {
          logger.info(`Progress: ${this.stats.processed}/${records.length}`);
        }
      }

            this.printStats();
      process.exit(0);

          } catch (error) {
      logger.error('Seeding failed:', error);
      process.exit(1);
    }
  }

    async processRecord(record) {
    try {

            const claimData = {
        claimHash: record.claimHash,
        originalText: record.statement,
        extractedClaim: record.statementEnglish || record.statement,
        status: this.mapLabelToStatus(record.label),
        confidenceScore: record.trustScore,
        explanationEnglish: this.generateExplanation(record, 'en'),
        explanationHindi: this.generateExplanation(record, 'hi'),
        suggestedAction: this.getSuggestedAction(record.label),

                trustedContext: [{
          title: `Verified by ${record.factCheckSource}`,
          source: record.factCheckSource,
          url: record.factCheckLink,
          publishedAt: record.publishDate
        }],

                clusterGroup: record.extractedKeywords.slice(0, 3).join('_'),
        regions: record.region ? [record.region] : [],
        queryCount: 0
      };

            await Claim.updateOne(
        { claimHash: record.claimHash },
        { $set: claimData },
        { upsert: true }
      );

            this.stats.migrated++;

            const cacheData = {
        status: claimData.status,
        confidence_score: claimData.confidenceScore,
        core_claim_extracted: claimData.extractedClaim,
        explanation_english: claimData.explanationEnglish,
        explanation_hindi: claimData.explanationHindi,
        suggested_action: claimData.suggestedAction
      };

            await cacheService.set(record.claimHash, cacheData, CACHE.TTL * 24); 
      this.stats.cached++;

          } catch (error) {
      logger.error(`Error processing record ${record.originalId}:`, error.message);
      this.stats.errors++;
    }
  }

    mapLabelToStatus(label) {
    const mapping = {
      'FALSE': 'FAKE',
      'TRUE': 'TRUE',
      'MISLEADING': 'FAKE',
      'UNVERIFIED': 'UNVERIFIED',
      'SATIRE': 'FAKE'
    };

        return mapping[label] || 'UNVERIFIED';
  }

    generateExplanation(record, language) {
    const status = this.mapLabelToStatus(record.label);

        if (language === 'en') {
      if (status === 'FAKE') {
        return `This claim has been fact-checked and found to be FALSE by ${record.factCheckSource}. Please verify before sharing.`;
      } else if (status === 'TRUE') {
        return `This claim has been verified as TRUE by ${record.factCheckSource}.`;
      } else {
        return `This claim could not be verified. Check official sources for updates.`;
      }
    } else {

            if (status === 'FAKE') {
        return `यह दावा ${record.factCheckSource} द्वारा गलत पाया गया है। कृपया साझा करने से पहले सत्यापित करें।`;
      } else if (status === 'TRUE') {
        return `यह दावा ${record.factCheckSource} द्वारा सत्य के रूप में सत्यापित किया गया है।`;
      } else {
        return `इस दावे की पुष्टि नहीं की जा सकी। अपडेट के लिए आधिकारिक स्रोतों की जांच करें।`;
      }
    }
  }

    getSuggestedAction(label) {
    const actions = {
      'FALSE': 'Do not forward. This is verified misinformation.',
      'TRUE': 'This information is verified as accurate.',
      'MISLEADING': 'Verify with official sources before sharing.',
      'UNVERIFIED': 'Wait for official confirmation.',
      'SATIRE': 'This is satire/parody. Do not share as real news.'
    };

        return actions[label] || 'Verify before sharing.';
  }

    printStats() {
    logger.info('\n' + '='.repeat(50));
    logger.info(' CACHE SEEDING STATISTICS');
    logger.info('='.repeat(50));
    logger.info(`Processed:        ${this.stats.processed}`);
    logger.info(` Migrated:      ${this.stats.migrated}`);
    logger.info(` Cached:        ${this.stats.cached}`);
    logger.info(` Errors:        ${this.stats.errors}`);
    logger.info('='.repeat(50) + '\n');
  }
}

const seeder = new CacheSeeder();
seeder.seed();