const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const { LLM } = require('../config/constants');

class LLMService {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'groq';
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';
    
    // Initialize Groq client
    if (this.provider === 'groq' && this.groqApiKey) {
      this.groqClient = new Groq({
        apiKey: this.groqApiKey
      });
      logger.info(`Groq LLM initialized with model: ${this.model}`);
    } else if (this.provider === 'openai' && this.openaiApiKey) {
      logger.info(`OpenAI LLM initialized with model: ${this.model}`);
    } else {
      logger.warn('No LLM API key found. Using MOCK mode.');
      this.provider = 'mock';
    }
  }

  /**
   * Extract the core claim from user's forwarded message
   */
  async extractClaim(userText) {
    const systemPrompt = `You are a claim extraction expert. Extract the core factual claim from the user's message in 5-10 words. Focus on the verifiable statement.

Example:
Input: "My friend said there's a curfew in Bangalore due to riots!"
Output: "Curfew in Bangalore due to riots"

Only return the extracted claim, nothing else.`;

    try {
      const response = await this._callLLM(systemPrompt, userText, 50);
      return response.trim();
    } catch (error) {
      logger.error('LLM Claim Extraction Error:', error.message);
      // Fallback: return first 100 chars
      return userText.substring(0, 100).trim();
    }
  }

  /**
   * Verify claim against trusted news context
   */
  async verifyClaim(userClaim, trustedContext) {
    const systemPrompt = `You are the "SatyaBot Verification Engine," a rigorous fact-checking AI. You are objective, analytical, and your top priority is factual accuracy.

CRITICAL EVALUATION PROCESS - Follow these steps IN ORDER:

STEP 1 - COMMON KNOWLEDGE CHECK (HIGHEST PRIORITY):
Before looking at any news context, evaluate the claim against well-established facts you know:
- World leaders: You KNOW who the Prime Minister / President of each country is. For example, Narendra Modi is the PM of INDIA (not Italy, not any other country). Giorgia Meloni is the PM of Italy.
- Geography: Capital cities, countries, continents, oceans.
- Science: Laws of physics, biology, chemistry, mathematics.
- History: Major historical events, dates, figures.
- If the claim CONTRADICTS any established common knowledge fact, immediately mark it as FAKE with confidence_score 95-100. Do NOT let news context override common knowledge.
- If the claim ALIGNS with established common knowledge, immediately mark it as TRUE with confidence_score 90-100.

STEP 2 - NEWS CONTEXT CHECK (for recent events / news only):
Only use TRUSTED_CONTEXT for claims about RECENT events, breaking news, or developing stories that are NOT covered by common knowledge.
- If TRUSTED_CONTEXT confirms the claim about a recent event, mark as TRUE with confidence proportional to source reliability.
- If TRUSTED_CONTEXT contradicts the claim, mark as FAKE.
- If TRUSTED_CONTEXT is available but inconclusive, mark as UNVERIFIED.

STEP 3 - UNCERTAINTY (last resort):
If the claim is not a common knowledge fact AND no news context is available or relevant, mark as UNVERIFIED with low confidence_score (10-40).

EXPLANATION RULES:
- Provide a 3-5 sentence detailed explanation in English. Include your reasoning: what fact was checked, what contradicts or confirms it, and why you reached your verdict.
- Provide the same detailed explanation translated into conversational Hindi.
- Be authoritative and clear. Cite specific facts (e.g., "Narendra Modi serves as the Prime Minister of India, not Italy").

Output Format: You must respond ONLY in strict JSON. Do not include markdown code blocks.
{
  "status": "FAKE" | "TRUE" | "UNVERIFIED",
  "confidence_score": 0-100,
  "core_claim_extracted": "A short summary of the claim",
  "explanation_english": "3-5 sentence detailed explanation with reasoning.",
  "explanation_hindi": "Same detailed explanation in conversational Hindi.",
  "suggested_action": "Clear action advice, e.g., 'Do not forward this claim. It is factually incorrect.'"
}`;

    const userPrompt = `USER_CLAIM: ${userClaim}

TRUSTED_CONTEXT: ${JSON.stringify(trustedContext, null, 2)}`;

    try {
      const response = await this._callLLM(systemPrompt, userPrompt, LLM.MAX_TOKENS);
      
      // Parse JSON response
      let cleanedResponse = response
        .replace(/```json\n?|\n?```/g, '')
        .replace(/```\n?|\n?```/g, '')
        .trim();
      
      const parsed = JSON.parse(cleanedResponse);
      
      // Validate response structure
      if (!parsed.status || parsed.confidence_score === undefined || parsed.confidence_score === null) {
        throw new Error('Invalid LLM response structure');
      }
      
      return parsed;
    } catch (error) {
      logger.error('LLM Verification Error:', error.message);
      
      // Fallback response
      return {
        status: 'UNVERIFIED',
        confidence_score: 0,
        core_claim_extracted: userClaim.substring(0, 50),
        explanation_english: 'Unable to verify at this time. Please check official sources.',
        explanation_hindi: 'इस समय सत्यापित करने में असमर्थ। कृपया आधिकारिक स्रोतों की जांच करें।',
        suggested_action: 'Wait and check official sources'
      };
    }
  }

  /**
   * Private method to call LLM API
   */
  async _callLLM(systemPrompt, userPrompt, maxTokens) {
    if (this.provider === 'groq') {
      return await this._callGroq(systemPrompt, userPrompt, maxTokens);
    } else if (this.provider === 'openai') {
      return await this._callOpenAI(systemPrompt, userPrompt, maxTokens);
    } else if (this.provider === 'mock') {
      return this._callMock(systemPrompt, userPrompt);
    }
    
    throw new Error(`Unsupported LLM provider: ${this.provider}`);
  }

  /**
   * Call Groq API
   */
  async _callGroq(systemPrompt, userPrompt, maxTokens) {
    try {
      const chatCompletion = await this.groqClient.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        model: this.model,
        temperature: LLM.TEMPERATURE || 0.2,
        max_tokens: maxTokens,
        top_p: 1,
        stream: false
      });

      return chatCompletion.choices[0]?.message?.content || '';
    } catch (error) {
      logger.error('Groq API Error:', error.message);
      throw error;
    }
  }

  /**
   * Call OpenAI API (fallback)
   */
  async _callOpenAI(systemPrompt, userPrompt, maxTokens) {
    const axios = require('axios');
    
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: maxTokens,
          temperature: LLM.TEMPERATURE || 0.2
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: LLM.TIMEOUT
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('OpenAI API Error:', error.message);
      throw error;
    }
  }

  /**
   * Mock LLM (fallback when no API key)
   */
  _callMock(systemPrompt, userPrompt) {
    logger.warn('Using MOCK LLM response');
    
    // Simple mock that extracts first sentence
    const lines = userPrompt.split('\n');
    const claimLine = lines.find(line => line.includes('USER_CLAIM:'));
    
    if (claimLine) {
      const claim = claimLine.replace('USER_CLAIM:', '').trim();
      return claim.substring(0, 80);
    }
    
    return userPrompt.substring(0, 80);
  }
}

module.exports = new LLMService();