const llmService = require('../services/llmService');
const newsService = require('../services/newsService');
const cacheService = require('../services/cacheService');
const clusterService = require('../services/clusterService');
const Claim = require('../models/Claim');
const Verification = require('../models/Verification');
const { generateHash } = require('../utils/hashGenerator');
const logger = require('../utils/logger');
const datasetService = require('../services/datasetService');

class VerificationController {
    async verifyWithDataset(req, res, next) {
  const startTime = Date.now();

    try {
    const { text, userId, location } = req.body;

        if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Text is required',
        code: 'MISSING_TEXT'
      });
    }

    const similarClaims = await datasetService.searchSimilarClaims(text, 3);

        if (similarClaims.length > 0) {
      const bestMatch = similarClaims[0];

            logger.info(` Found verified match in dataset: ${bestMatch.originalId}`);

            await datasetService.recordUsage(bestMatch._id);

            // Run full LLM analysis pipeline for rich contextual response
            const claimText = bestMatch.statementEnglish || bestMatch.statement || text;
            let richExplanation = {};
            let newsSources = [];
            let newsCredibility = 0;

            try {
              const extractedClaim = await llmService.extractClaim(claimText);
              logger.info(`Dataset match - extracted claim for enrichment: ${extractedClaim}`);

              const trustedContext = await newsService.fetchRelatedNews(extractedClaim);
              logger.info(`Dataset match - found ${trustedContext.articles.length} related articles`);

              richExplanation = await llmService.verifyClaim(extractedClaim, trustedContext.articles);
              newsSources = trustedContext.sources || [];
              newsCredibility = trustedContext.credibilityScore || 0;
            } catch (enrichError) {
              logger.warn(`Dataset match enrichment failed, using fallback: ${enrichError.message}`);
            }

            // Build comprehensive sources list: dataset source first, then news sources
            const datasetSources = [];
      if (bestMatch.factCheckLink) {
        datasetSources.push({
          title: `Fact-check by ${bestMatch.factCheckSource || 'Verified Database'}`,
          source: bestMatch.factCheckSource || 'Fact-Check Database',
          url: bestMatch.factCheckLink,
          credibilityTier: 'high',
          apiSource: 'verified_dataset'
        });
      }

            const combinedSources = [...datasetSources, ...newsSources];

            // Use rich explanation from LLM if available, otherwise fallback
            const explanationEn = richExplanation.explanation_english
              || `This claim was fact-checked by ${bestMatch.factCheckSource}.`;
            const explanationHi = richExplanation.explanation_hindi
              || `यह दावा ${bestMatch.factCheckSource} द्वारा सत्यापित किया गया था।`;
            const suggestedAction = richExplanation.suggested_action
              || this._getSuggestedAction(bestMatch.label);
            const classification = richExplanation.classification || 'Dynamic News';

      return res.status(200).json({
        status: this._mapLabelToStatus(bestMatch.label),
        confidence_score: bestMatch.trustScore,
        classification: classification,
        core_claim_extracted: bestMatch.statementEnglish || bestMatch.statement,
        explanation_english: explanationEn,
        explanation_hindi: explanationHi,
        suggested_action: suggestedAction,
        source: 'verified_dataset',
        sources: combinedSources,
        fact_check_link: bestMatch.factCheckLink,
        processingTime: Date.now() - startTime
      });
    }

        return await this.verify(req, res, next);

      } catch (error) {
    logger.error('Dataset verification error:', error);
    next(error);
  }
}

_mapLabelToStatus(label) {
  const mapping = {
    'FALSE': 'FAKE',
    'TRUE': 'TRUE',
    'MISLEADING': 'FAKE',
    'UNVERIFIED': 'UNVERIFIED'
  };
  return mapping[label] || 'UNVERIFIED';
}

_getSuggestedAction(label) {
  const actions = {
    'FALSE': 'Do not forward. Verified as false.',
    'TRUE': 'Verified as accurate.',
    'MISLEADING': 'Verify before sharing.',
    'UNVERIFIED': 'Wait for official sources.'
  };
  return actions[label] || 'Verify before sharing.';
}

  async verify(req, res, next) {
    const startTime = Date.now();

        try {
      const { text, userId, location } = req.body;

            if (!text || text.trim().length === 0) {
        return res.status(400).json({
          error: 'Text is required',
          code: 'MISSING_TEXT'
        });
      }

      const claimHash = generateHash(text);
      logger.info(`Processing claim: ${claimHash}`);

      const cachedResult = await cacheService.get(claimHash);

            if (cachedResult) {

                await cacheService.incrementTrending(claimHash);

                await this._logVerification({
          claimHash,
          userId,
          userMessage: text,
          processingTime: Date.now() - startTime,
          cacheHit: true,
          result: cachedResult,
          userLocation: location
        });

        return res.status(200).json({
          ...cachedResult,
          sources: cachedResult.sources || [],
          cached: true,
          processingTime: Date.now() - startTime
        });
      }

      const similarClaim = await clusterService.findSimilarClaim(text);

            if (similarClaim) {
        logger.info(`Using clustered result for: ${claimHash}`);

                await similarClaim.incrementQuery();

                const clusterSources = (similarClaim.trustedContext || []).map(ctx => ({
          title: ctx.title || 'Related Article',
          source: ctx.source || 'News Source',
          url: ctx.url || '',
          credibilityTier: ctx.credibilityTier || 'medium',
          apiSource: ctx.apiSource || 'cluster_reference'
        }));

        const result = {
          status: similarClaim.status,
          confidence_score: similarClaim.confidenceScore,
          core_claim_extracted: similarClaim.extractedClaim,
          explanation_english: similarClaim.explanationEnglish,
          explanation_hindi: similarClaim.explanationHindi,
          suggested_action: similarClaim.suggestedAction,
          sources: clusterSources
        };

                await cacheService.set(claimHash, result);

                return res.status(200).json({
          ...result,
          clustered: true,
          processingTime: Date.now() - startTime
        });
      }

      const extractedClaim = await llmService.extractClaim(text);
      logger.info(`Extracted claim: ${extractedClaim}`);

      const trustedContext = await newsService.fetchRelatedNews(extractedClaim);
      logger.info(`Found ${trustedContext.articles.length} related articles`);

      const verificationResult = await llmService.verifyClaim(
        extractedClaim,
        trustedContext.articles 
      );

      try {
        await Claim.findOneAndUpdate(
          { claimHash },
          {
            $set: {
              originalText: text,
              extractedClaim: verificationResult.core_claim_extracted,
              status: verificationResult.status,
              confidenceScore: verificationResult.confidence_score,
              explanationEnglish: verificationResult.explanation_english,
              explanationHindi: verificationResult.explanation_hindi,
              suggestedAction: verificationResult.suggested_action,
              trustedContext: trustedContext.articles,
              clusterGroup: clusterService.generateClusterId(extractedClaim),
            },
            $addToSet: { regions: location || undefined },
            $setOnInsert: { claimHash }
          },
          { upsert: true, new: true }
        );
        logger.info(`Claim saved to database: ${claimHash}`);
      } catch (dbError) {
        logger.error(`Failed to save claim ${claimHash}:`, dbError.message);
      }

      const llmConfidence = verificationResult.confidence_score || 0;
      const newsCredibility = trustedContext.credibilityScore || 0;
      const classification = verificationResult.classification || 'Dynamic News';

      let mergedConfidence;
      if (classification === 'General Fact') {
        mergedConfidence = llmConfidence;
      } else if (classification === 'Opinion') {
        mergedConfidence = 0;
      } else {
        mergedConfidence = Math.round(llmConfidence * 0.7 + newsCredibility * 0.3);
      }

      const llmSources = verificationResult.sources || [];
      const newsSources = trustedContext.sources || [];
      const combinedSources = newsSources.length > 0 ? newsSources : llmSources.map(s => ({
        title: s,
        source: s,
        url: '',
        credibilityTier: 'high',
        apiSource: 'llm_reference'
      }));

      const finalResult = {
        ...verificationResult,
        confidence_score: mergedConfidence,
        classification: classification,
        sources: combinedSources,
      };

      await cacheService.set(claimHash, finalResult);
      await cacheService.incrementTrending(claimHash);

      await this._logVerification({
        claimHash,
        userId,
        userMessage: text,
        processingTime: Date.now() - startTime,
        cacheHit: false,
        llmCalls: 2, 
        newsApiCalls: trustedContext.sources.length,
        result: finalResult,
        userLocation: location
      });

      return res.status(200).json({
        ...finalResult,
        cached: false,
        processingTime: Date.now() - startTime
      });

    } catch (error) {
      logger.error('Verification error:', error);
      next(error);
    }
  }

    async _logVerification(data) {
    try {
      const verification = new Verification(data);
      await verification.save();
    } catch (error) {
      logger.error('Failed to log verification:', error.message);
    }
  }
}

module.exports = new VerificationController();