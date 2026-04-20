const axios = require('axios');
const logger = require('../utils/logger');
const { TRUSTED_SOURCES } = require('../config/constants');

class NewsService {
  constructor() {
    this.newsApiKey = process.env.NEWS_API_KEY;
    this.gdeltEndpoint = process.env.GDELT_API_ENDPOINT || 'https://api.gdeltproject.org/api/v2/doc/doc';
    this.googleNewsApi = process.env.GOOGLE_NEWS_API || 'https://newsapi.org/v2/everything';
    this.googleFactCheckKey = process.env.GOOGLE_FACTCHECK_API_KEY || process.env.GEMINI_API_KEY;
    this.timeout = 6000;
  }

  async fetchRelatedNews(claim, limit = 8) {
    const keywords = this._extractSearchKeywords(claim);

    const results = await Promise.allSettled([
      this._fetchDuckDuckGo(keywords),
      this._fetchWikipedia(keywords),
      this._fetchGDELT(keywords),
      this._fetchGoogleNewsAPI(keywords),
      this._fetchTrustedSiteSearch(keywords),
      this._fetchGoogleFactCheck(keywords),
    ]);

    const apiNames = ['DuckDuckGo', 'Wikipedia', 'GDELT', 'GoogleNews', 'TrustedSiteSearch', 'GoogleFactCheck'];
    const sources = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        const items = Array.isArray(result.value) ? result.value : [result.value];
        const validItems = items.filter(s => s && s.title);
        sources.push(...validItems);
        logger.info(`${apiNames[index]}: ${validItems.length} results collected`);
      } else if (result.status === 'rejected') {
        logger.warn(`${apiNames[index]} API failed: ${result.reason?.message || 'Unknown error'}`);
      } else {
        logger.info(`${apiNames[index]}: 0 results (empty response)`);
      }
    });

    const tierValue = { 'high': 3, 'medium': 2, 'low': 1 };
    sources.sort((a, b) => (tierValue[b.credibilityTier] || 0) - (tierValue[a.credibilityTier] || 0));

    const seen = new Set();
    const dedupedSources = sources.filter(s => {
      const key = (s.url || s.title).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const finalSources = dedupedSources.slice(0, limit);
    const credibilityScore = this._calculateCredibilityScore(finalSources);

    const articles = finalSources.map(s => ({
      title: s.title,
      source: s.source,
      url: s.url,
      publishedAt: s.publishedAt || new Date().toISOString(),
      description: s.description
    }));

    logger.info(`Total aggregated: ${sources.length} raw, ${finalSources.length} final articles, credibility: ${credibilityScore}`);

    return {
      sources: finalSources,
      credibilityScore,
      articles
    };
  }

  // ───── Fetcher 1: DuckDuckGo Instant Answers ─────
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
        const topics = data.RelatedTopics.slice(0, 3);
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

      return results;
    } catch (error) {
      logger.error(`DuckDuckGo API Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  // ───── Fetcher 2: Wikipedia ─────
  async _fetchWikipedia(keywords) {
    try {
      const searchTerms = keywords.split(' ').slice(0, 5).join(' ');

      const searchResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
        params: {
          action: 'query',
          list: 'search',
          srsearch: searchTerms,
          srlimit: 3,
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

      const summaryPromises = searchResults.slice(0, 3).map(sr =>
        axios.get(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sr.title)}`,
          {
            headers: {
              'User-Agent': 'SatyaBot/1.0 (https://github.com/satyabot; satyabot@example.com)'
            },
            timeout: this.timeout
          }
        ).then(resp => {
          const summary = resp.data;
          if (summary.extract) {
            return {
              title: summary.title,
              source: 'Wikipedia',
              url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(sr.title)}`,
              description: summary.extract.substring(0, 300),
              publishedAt: summary.timestamp || new Date().toISOString(),
              credibilityTier: 'high',
              apiSource: 'wikipedia'
            };
          }
          return null;
        }).catch(e => {
          logger.warn(`Wikipedia summary failed for "${sr.title}": ${e.message}`);
          return null;
        })
      );

      const results = (await Promise.all(summaryPromises)).filter(Boolean);
      return results;
    } catch (error) {
      logger.error(`Wikipedia API Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  // ───── Fetcher 3: GDELT ─────
  async _fetchGDELT(keywords) {
    try {
      const response = await axios.get(this.gdeltEndpoint, {
        params: {
          query: keywords,
          mode: 'ArtList',
          maxrecords: 5,
          format: 'json',
          sort: 'DateDesc',
          timespan: '7d'
        },
        timeout: this.timeout
      });

      const articles = response.data?.articles || [];

      const results = articles.slice(0, 5).map(article => ({
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

      return results;
    } catch (error) {
      logger.error(`GDELT API Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  // ───── Fetcher 4: Google News API (NewsAPI.org) ─────
  async _fetchGoogleNewsAPI(keywords) {
    if (!this.newsApiKey) {
      logger.warn('NEWS_API_KEY not set, skipping Google News fetch');
      return [];
    }

    try {
      const trustedDomains = [
        'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk',
        'thehindu.com', 'indianexpress.com', 'ndtv.com',
        'aljazeera.com', 'theguardian.com', 'nytimes.com',
        'hindustantimes.com', 'livemint.com', 'theprint.in',
        'scroll.in', 'firstpost.com', 'news18.com',
        'deccanherald.com', 'pti.org.in', 'france24.com',
        'dw.com', 'washingtonpost.com'
      ];
      const domains = trustedDomains.join(',');

      const response = await axios.get(this.googleNewsApi, {
        params: {
          q: keywords,
          domains: domains,
          sortBy: 'relevancy',
          pageSize: 5,
          language: 'en',
          apiKey: this.newsApiKey
        },
        timeout: this.timeout
      });

      const articles = response.data?.articles || [];

      const results = articles.slice(0, 5).map(article => {
        const sourceDomain = this._extractDomain(article.url);
        return {
          title: article.title || 'News Article',
          source: article.source?.name || sourceDomain || 'NewsAPI',
          url: article.url,
          description: (article.description || article.title || '').substring(0, 300),
          publishedAt: article.publishedAt || new Date().toISOString(),
          credibilityTier: this._getDomainTier(sourceDomain),
          apiSource: 'googlenews'
        };
      });

      return results;
    } catch (error) {
      logger.error(`Google News API Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  // ───── Fetcher 5: Trusted Site Search via DuckDuckGo ─────
  async _fetchTrustedSiteSearch(keywords) {
    const prioritySites = [
      'reuters.com',
      'apnews.com',
      'bbc.com',
      'thehindu.com',
      'indianexpress.com',
      'ndtv.com',
      'pib.gov.in',
      'aljazeera.com'
    ];

    const siteQuery = prioritySites.map(s => `site:${s}`).join(' OR ');
    const fullQuery = `${keywords} ${siteQuery}`;

    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: fullQuery,
          format: 'json',
          no_html: 1,
          skip_disambig: 1
        },
        timeout: this.timeout
      });

      const data = response.data;
      const results = [];

      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || keywords,
          source: this._extractDomain(data.AbstractURL) || 'Trusted Source',
          url: data.AbstractURL,
          description: data.AbstractText.substring(0, 300),
          publishedAt: new Date().toISOString(),
          credibilityTier: this._getDomainTier(this._extractDomain(data.AbstractURL)),
          apiSource: 'trusted_search'
        });
      }

      if (data.Results && data.Results.length > 0) {
        data.Results.slice(0, 3).forEach(r => {
          if (r.Text && r.FirstURL) {
            const domain = this._extractDomain(r.FirstURL);
            results.push({
              title: r.Text.substring(0, 100),
              source: domain || 'Trusted Source',
              url: r.FirstURL,
              description: r.Text.substring(0, 250),
              publishedAt: new Date().toISOString(),
              credibilityTier: this._getDomainTier(domain),
              apiSource: 'trusted_search'
            });
          }
        });
      }

      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        data.RelatedTopics.slice(0, 2).forEach(topic => {
          if (topic.Text && topic.FirstURL) {
            const domain = this._extractDomain(topic.FirstURL);
            results.push({
              title: topic.Text.substring(0, 100),
              source: domain || 'DuckDuckGo Related',
              url: topic.FirstURL,
              description: topic.Text.substring(0, 250),
              publishedAt: new Date().toISOString(),
              credibilityTier: this._getDomainTier(domain),
              apiSource: 'trusted_search'
            });
          }
        });
      }

      return results;
    } catch (error) {
      logger.error(`Trusted Site Search Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  // ───── Fetcher 6: Google Fact Check Tools API ─────
  async _fetchGoogleFactCheck(keywords) {
    if (!this.googleFactCheckKey) {
      logger.warn('No Google API key set, skipping Fact Check fetch');
      return [];
    }

    try {
      const response = await axios.get('https://factchecktools.googleapis.com/v1alpha1/claims:search', {
        params: {
          query: keywords,
          key: this.googleFactCheckKey,
          languageCode: 'en',
          pageSize: 5
        },
        timeout: this.timeout
      });

      const claims = response.data?.claims || [];

      const results = claims.slice(0, 5).map(claim => {
        const review = claim.claimReview?.[0] || {};
        const publisherDomain = this._extractDomain(review.url || '');
        return {
          title: claim.text || review.title || 'Fact Check',
          source: review.publisher?.name || publisherDomain || 'Google Fact Check',
          url: review.url || '',
          description: `Rated: ${review.textualRating || 'N/A'}. ${(review.title || claim.text || '').substring(0, 250)}`,
          publishedAt: review.reviewDate || new Date().toISOString(),
          credibilityTier: 'high',
          apiSource: 'google_factcheck',
          factCheckRating: review.textualRating || null
        };
      });

      return results;
    } catch (error) {
      logger.error(`Google Fact Check API Error: ${error.response?.status || error.message}`);
      return [];
    }
  }

  // ───── Credibility Scoring ─────
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

    const sourceAPIs = new Set(sources.map(s => s.apiSource));

    sources.forEach(source => {
      const weight = tierWeights[source.credibilityTier] || 1;
      totalWeight += weight;
      maxPossibleWeight += 3;
    });

    let score = Math.round((totalWeight / maxPossibleWeight) * 60);

    const hasGDELT = sources.some(s => s.apiSource === 'gdelt');
    const hasGoogleNews = sources.some(s => s.apiSource === 'googlenews');
    const hasTrustedSearch = sources.some(s => s.apiSource === 'trusted_search');
    const hasGoogleFactCheck = sources.some(s => s.apiSource === 'google_factcheck');

    if (hasGDELT) score += 8;
    if (hasGoogleNews) score += 10;
    if (hasTrustedSearch) score += 7;
    if (hasGoogleFactCheck) score += 12;
    if (sourceAPIs.size >= 4) score += 10;
    else if (sourceAPIs.size >= 3) score += 7;
    else if (sourceAPIs.size >= 2) score += 4;

    return Math.min(100, Math.max(0, score));
  }

  // ───── Domain Tier Helpers ─────
  _getGDELTSourceTier(domain) {
    if (!domain) return 'low';

    const highTier = [
      'reuters.com', 'apnews.com', 'afp.com',
      'bbc.com', 'bbc.co.uk', 'aljazeera.com', 'dw.com', 'france24.com',
      'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'wsj.com', 'economist.com',
      'thehindu.com', 'indianexpress.com', 'ndtv.com', 'pib.gov.in',
      'pti.org.in', 'ani.in', 'abc.net.au', 'nhk.or.jp',
      'cnn.com', 'usatoday.com', 'ft.com'
    ];
    const medTier = [
      'timesofindia.indiatimes.com', 'hindustantimes.com', 'news18.com',
      'firstpost.com', 'theprint.in', 'scroll.in', 'livemint.com',
      'economictimes.indiatimes.com', 'thewire.in', 'deccanherald.com',
      'deccanchronicle.com', 'tribuneindia.com', 'telegraphindia.com',
      'business-standard.com', 'outlookindia.com', 'moneycontrol.com'
    ];

    if (highTier.some(t => domain.includes(t))) return 'high';
    if (medTier.some(t => domain.includes(t))) return 'medium';
    return 'low';
  }

  _getDomainTier(domain) {
    if (!domain) return 'low';
    return this._getGDELTSourceTier(domain);
  }

  _extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  // ───── Keyword Extraction ─────
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
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return TRUSTED_SOURCES.some(trusted => domain.includes(trusted));
    } catch {
      return false;
    }
  }
}

module.exports = new NewsService();