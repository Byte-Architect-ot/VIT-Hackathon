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
    // International Wire Services
    'reuters.com',
    'apnews.com',
    'afp.com',

    // Global Broadcasters
    'bbc.com',
    'bbc.co.uk',
    'aljazeera.com',
    'dw.com',
    'france24.com',
    'abc.net.au',
    'nhk.or.jp',

    // Major Western Outlets
    'nytimes.com',
    'washingtonpost.com',
    'theguardian.com',
    'wsj.com',
    'economist.com',
    'ft.com',
    'usatoday.com',
    'cnn.com',

    // Indian Government
    'pib.gov.in',
    'mha.gov.in',
    'ndrf.gov.in',
    'pmindia.gov.in',

    // Indian Wire / Agency
    'pti.org.in',
    'ani.in',

    // Major Indian Outlets
    'thehindu.com',
    'indianexpress.com',
    'ndtv.com',
    'hindustantimes.com',
    'livemint.com',
    'timesofindia.indiatimes.com',
    'economictimes.indiatimes.com',
    'theprint.in',
    'scroll.in',
    'thewire.in',
    'news18.com',
    'firstpost.com',
    'deccanherald.com',
    'deccanchronicle.com',
    'tribuneindia.com',
    'telegraphindia.com',
    'business-standard.com',
    'outlookindia.com'
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