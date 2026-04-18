module.exports = {

    STATUS: {
    FAKE: 'FAKE',
    TRUE: 'TRUE',
    UNVERIFIED: 'UNVERIFIED'
  },

  CONFIDENCE: {
    HIGH: 80,
    MEDIUM: 50,
    LOW: 30
  },

  CACHE: {
    TTL: parseInt(process.env.CACHE_TTL) || 3600, 
    TRENDING_TTL: 300, 
    PREFIX: {
      CLAIM: 'claim:',
      TRENDING: 'trending:',
      CLUSTER: 'cluster:'
    }
  },

  TRUSTED_SOURCES: [
    'pib.gov.in',
    'mha.gov.in',
    'ndrf.gov.in',
    'pmindia.gov.in',
    'reuters.com',
    'pti.org.in',
    'thehindu.com',
    'indianexpress.com'
  ],

  LLM: {
    MAX_TOKENS: 800,
    TEMPERATURE: 0.2, 
    TIMEOUT: 15000 
  },

  LIMITS: {
    MAX_CLAIM_LENGTH: 5000,
    MAX_BATCH_SIZE: 10,
    QUERY_VELOCITY_THRESHOLD: 5 
  }
};