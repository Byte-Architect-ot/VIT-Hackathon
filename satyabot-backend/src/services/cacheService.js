const { getRedisClient } = require('../config/redis');
const logger = require('../utils/logger');
const { CACHE } = require('../config/constants');

class CacheService {
    async get(claimHash) {
    try {
      const client = getRedisClient();
      const key = `${CACHE.PREFIX.CLAIM}${claimHash}`;
      const cached = await client.get(key);
      
      if (cached) {
        logger.info(`Cache HIT for: ${claimHash}`);
        return JSON.parse(cached);
      }
      
      logger.info(`Cache MISS for: ${claimHash}`);
      return null;
    } catch (error) {
      logger.error('Cache GET error:', error.message);
      return null; 
    }
  }

    async set(claimHash, data, ttl = CACHE.TTL) {
    try {
      const client = getRedisClient();
      const key = `${CACHE.PREFIX.CLAIM}${claimHash}`;
      
      await client.setEx(
        key,
        ttl,
        JSON.stringify(data)
      );
      
      logger.info(`Cache SET for: ${claimHash}`);
      return true;
    } catch (error) {
      logger.error('Cache SET error:', error.message);
      return false;
    }
  }

    async incrementTrending(claimHash) {
    try {
      const client = getRedisClient();
      const key = `${CACHE.PREFIX.TRENDING}${claimHash}`;
      
      await client.incr(key);
      await client.expire(key, 600); 
      
      return true;
    } catch (error) {
      logger.error('Trending increment error:', error.message);
      return false;
    }
  }

    async getTrending(limit = 10) {
    try {
      const client = getRedisClient();
      const pattern = `${CACHE.PREFIX.TRENDING}*`;
      
      const keys = await client.keys(pattern);
      const trendingData = [];
      
      for (const key of keys) {
        const count = await client.get(key);
        trendingData.push({
          claimHash: key.replace(CACHE.PREFIX.TRENDING, ''),
          queryCount: parseInt(count)
        });
      }
      
      // Sort by query count
      trendingData.sort((a, b) => b.queryCount - a.queryCount);
      
      return trendingData.slice(0, limit);
    } catch (error) {
      logger.error('Get trending error:', error.message);
      return [];
    }
  }
}

module.exports = new CacheService();