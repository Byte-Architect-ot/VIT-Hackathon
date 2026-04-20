const Claim = require('../models/Claim');
const logger = require('../utils/logger');

class ClusterService {
    async findSimilarClaim(extractedClaim) {
    try {

            const keywords = this._extractKeywords(extractedClaim);

            if (keywords.length === 0) return null;

            // Require ALL keywords to match (AND logic), not just any one
            const regexConditions = keywords.map(kw => ({
              extractedClaim: { $regex: kw, $options: 'i' }
            }));

            const similarClaims = await Claim.find({
              $and: regexConditions
            })
      .sort({ createdAt: -1 })
      .limit(1);

            if (similarClaims.length > 0) {
        logger.info(`Similar claim found: ${similarClaims[0].claimHash}`);
        return similarClaims[0];
      }

            return null;
    } catch (error) {
      logger.error('Cluster search error:', error.message);
      return null;
    }
  }

    _extractKeywords(text) {
    const stopWords = ['the', 'is', 'in', 'at', 'on', 'a', 'an', 'and', 'or', 'but'];

        return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.includes(word))
      .slice(0, 5); 
  }

    generateClusterId(extractedClaim) {
    const keywords = this._extractKeywords(extractedClaim);
    return keywords.sort().join('_');
  }
}

module.exports = new ClusterService();