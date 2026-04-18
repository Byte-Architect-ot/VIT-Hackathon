const axios = require('axios');
const logger = require('../utils/logger');

class NewsService {
  constructor() {
    this.newsApiKey = process.env.NEWS_API_KEY;
    this.gdeltEndpoint = process.env.GDELT_API_ENDPOINT || 'https://api.gdeltproject.org/api/v2/doc/doc';
    this.timeout = 8000;
  }

  async fetchRelatedNews(claim, limit = 5) {
    const keywords = this._extractSearchKeywords(claim);

    const results = await Promise.allSettled([
      this._fetchDuckDuckGo(keywords),
      this._fetchWikipedia(keywords),
      this._fetchGDELT(keywords),
    ]);

    const sources = [];

    results.forEach((result, index) => {
      const apiNames = ['DuckDuckGo', 'Wikipedia', 'GDELT'];
      if (result.status === 'fulfilled' && result.value) {
        const items = Array.isArray(result.value) ? result.value : [result.value];
        sources.push(...items);
      } else if (result.status === 'rejected') {
        logger.warn(`${apiNames[index]} API failed: ${result.reason?.message || 'Unknown error'}`);
      }
    });

    const filteredSources = sources.filter(s => s && s.title);

    const tierValue = { 'high': 3, 'medium': 2, 'low': 1 };
    filteredSources.sort((a, b) => (tierValue[b.credibilityTier] || 0) - (tierValue[a.credibilityTier] || 0));

    const finalSources = filteredSources.slice(0, 3);
    const credibilityScore = this._calculateCredibilityScore(finalSources);

    const articles = finalSources.map(s => ({
      title: s.title,
      source: s.source,
      url: s.url,
      publishedAt: s.publishedAt || new Date().toISOString(),
      description: s.description
    }));

    return {
      sources: filteredSources,
      credibilityScore,
      articles
    };
  }

  async _fetchDuckDuckGo(keywords) {
    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: keywords,
          format: 'json',
          no_html: 1,
          skip_disambig: 1
        },
        timeout: this.timeout
      });

      const data = response.data;
      const results = [];

      if (data.AbstractText) {
        results.push({
          title: data.Heading || keywords,
          source: 'DuckDuckGo Instant Answer',
          url: data.AbstractURL || 'https://duckduckgo.com',
          description: data.AbstractText.substring(0, 300),
          publishedAt: new Date().toISOString(),
          credibilityTier: 'medium',
          apiSource: 'duckduckgo'
        });
      }

      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        const topics = data.RelatedTopics.slice(0, 2);
        topics.forEach(topic => {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.substring(0, 100),
              source: 'DuckDuckGo Related',
              url: topic.FirstURL,
              description: topic.Text.substring(0, 250),
              publishedAt: new Date().toISOString(),
              credibilityTier: 'medium',
              apiSource: 'duckduckgo'
            });
          }
        });
      }

      logger.info(`DuckDuckGo returned ${results.length} results`);
      return results;
    } catch (error) {
      logger.error(`DuckDuckGo API Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  async _fetchWikipedia(keywords) {
    try {
      const searchTerms = keywords.split(' ').slice(0, 4).join(' ');

      const searchResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
        params: {
          action: 'query',
          list: 'search',
          srsearch: searchTerms,
          srlimit: 2,
          format: 'json',
          origin: '*'
        },
        headers: {
          'User-Agent': 'SatyaBot/1.0 (https://github.com/satyabot; satyabot@example.com)'
        },
        timeout: this.timeout
      });

      const searchResults = searchResponse.data?.query?.search || [];
      if (searchResults.length === 0) return [];

      const results = [];

      for (const sr of searchResults.slice(0, 2)) {
        try {
          const summaryResponse = await axios.get(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sr.title)}`,
            {
              headers: {
                'User-Agent': 'SatyaBot/1.0 (https://github.com/satyabot; satyabot@example.com)'
              },
              timeout: this.timeout
            }
          );

          const summary = summaryResponse.data;
          if (summary.extract) {
            results.push({
              title: summary.title,
              source: 'Wikipedia',
              url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(sr.title)}`,
              description: summary.extract.substring(0, 300),
              publishedAt: summary.timestamp || new Date().toISOString(),
              credibilityTier: 'high',
              apiSource: 'wikipedia'
            });
          }
        } catch (e) {
          logger.warn(`Wikipedia summary fetch failed for "${sr.title}": ${e.message}`);
        }
      }

      logger.info(`Wikipedia returned ${results.length} results`);
      return results;
    } catch (error) {
      logger.error(`Wikipedia API Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  async _fetchGDELT(keywords) {
    try {
      const response = await axios.get(this.gdeltEndpoint, {
        params: {
          query: keywords,
          mode: 'ArtList',
          maxrecords: 3,
          format: 'json',
          sort: 'DateDesc',
          timespan: '7d'
        },
        timeout: this.timeout
      });

      const articles = response.data?.articles || [];

      const results = articles.slice(0, 3).map(article => ({
        title: article.title || 'GDELT Article',
        source: article.domain || 'GDELT',
        url: article.url,
        description: (article.title || '').substring(0, 250),
        publishedAt: article.seendate ?
          new Date(
            article.seendate.substring(0, 4) + '-' +
            article.seendate.substring(4, 6) + '-' +
            article.seendate.substring(6, 8)
          ).toISOString() : new Date().toISOString(),
        credibilityTier: this._getGDELTSourceTier(article.domain),
        apiSource: 'gdelt'
      }));

      logger.info(`GDELT returned ${results.length} results`);
      return results;
    } catch (error) {
      logger.error(`GDELT API Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  async _fetchReddit(keywords) {
    try {
      const response = await axios.get('https://www.reddit.com/search.json', {
        params: {
          q: keywords,
          sort: 'relevance',
          t: 'week',
          limit: 3,
          type: 'link'
        },
        headers: {
          'User-Agent': 'SatyaBot/1.0 (Fact-Checking Bot)'
        },
        timeout: this.timeout
      });

      const posts = response.data?.data?.children || [];

      const results = posts.slice(0, 3).map(post => {
        const d = post.data;
        return {
          title: d.title || 'Reddit Post',
          source: `Reddit r/${d.subreddit}`,
          url: `https://reddit.com${d.permalink}`,
          description: (d.selftext || d.title || '').substring(0, 250),
          publishedAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : new Date().toISOString(),
          credibilityTier: this._getRedditTier(d),
          apiSource: 'reddit',
          upvotes: d.ups || 0,
          commentCount: d.num_comments || 0
        };
      });

      logger.info(`Reddit returned ${results.length} results`);
      return results;
    } catch (error) {
      logger.error(`Reddit API Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  _calculateCredibilityScore(sources) {
    if (!sources || sources.length === 0) return 0;

    const hasWikipedia = sources.some(s => s.apiSource === 'wikipedia');
    const hasHighTierNews = sources.some(s => s.credibilityTier === 'high');

    if (hasWikipedia || hasHighTierNews) {
      return 100;
    }

    const tierWeights = { high: 3, medium: 2, low: 1 };
    let totalWeight = 0;
    let maxPossibleWeight = 0;

    const hasGDELT = sources.some(s => s.apiSource === 'gdelt');
    const sourceAPIs = new Set(sources.map(s => s.apiSource));

    sources.forEach(source => {
      const weight = tierWeights[source.credibilityTier] || 1;
      totalWeight += weight;
      maxPossibleWeight += 3;
    });

    let score = Math.round((totalWeight / maxPossibleWeight) * 60);

    if (hasGDELT) score += 10;
    if (sourceAPIs.size >= 3) score += 10;
    if (sourceAPIs.size >= 2) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  _getGDELTSourceTier(domain) {
    if (!domain) return 'low';

    const highTier = ['reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'thehindu.com',
      'indianexpress.com', 'ndtv.com', 'aljazeera.com', 'theguardian.com', 'nytimes.com',
      'washingtonpost.com', 'pib.gov.in'];
    const medTier = ['timesofindia.indiatimes.com', 'hindustantimes.com', 'news18.com',
      'firstpost.com', 'theprint.in', 'scroll.in', 'livemint.com', 'economictimes.indiatimes.com'];

    if (highTier.some(t => domain.includes(t))) return 'high';
    if (medTier.some(t => domain.includes(t))) return 'medium';
    return 'low';
  }

  _getRedditTier(postData) {
    const trustedSubreddits = ['news', 'worldnews', 'science', 'india', 'askscience',
      'neutralpolitics', 'geopolitics', 'explainlikeimfive'];

    if (trustedSubreddits.includes(postData.subreddit?.toLowerCase())) {
      return postData.ups > 100 ? 'medium' : 'low';
    }
    return 'low';
  }

  _extractSearchKeywords(claim) {
    const stopWords = new Set(['the', 'is', 'in', 'at', 'on', 'a', 'an', 'and', 'or', 'but',
      'of', 'to', 'for', 'it', 'has', 'have', 'had', 'was', 'were', 'be', 'been',
      'that', 'this', 'with', 'from', 'are', 'not', 'will', 'can', 'do', 'did',
      'does', 'its', 'my', 'your', 'our', 'his', 'her', 'they', 'we', 'you', 'i',
      'said', 'says', 'saying', 'people', 'confirmed', 'declared']);

    return claim
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
      .slice(0, 6)
      .join(' ');
  }

  isTrustedSource(url) {
    const { TRUSTED_SOURCES } = require('../config/constants');

    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return TRUSTED_SOURCES.some(trusted => domain.includes(trusted));
    } catch {
      return false;
    }
  }
}

module.exports = new NewsService();