const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const { LLM } = require('../config/constants');

class LLMService {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'groq';
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';

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
      return userText.substring(0, 100).trim();
    }
  }

  async verifyClaim(userClaim, trustedContext) {
    const systemPrompt = `You are "SatyaBot", an expert Fact-Checking AI designed for Indian citizens. Your job is to verify claims, debunk rumors, and provide clear, truthful explanations with high confidence.

STEP 1 - CLASSIFY THE CLAIM into exactly one of three categories:

CATEGORY 1: "General Fact" - Established, universally accepted facts.
Examples: political leaders and their roles, capitals of countries, scientific laws, historical events, geography.
Key examples you MUST know with absolute certainty:
- Narendra Modi is the Prime Minister of India (NOT of any other country).
- Giorgia Meloni is the Prime Minister of Italy.
- Delhi is the capital of India. Tokyo is the capital of Japan.
- Water boils at 100 degrees Celsius at standard atmospheric pressure.
- The Earth revolves around the Sun.
- India got independence in 1947.
Action: Use ONLY your pre-trained knowledge. Do NOT rely on TRUSTED_CONTEXT for these. Mark as TRUE (confidence 95-100) if correct, or FAKE (confidence 95-100) if incorrect. For sources, cite "Official Government Records", "General Encyclopedias", "Established Scientific Knowledge" etc.

CATEGORY 2: "Dynamic News" - Recent events, breaking news, viral forwards, crisis updates, statistics that change.
Examples: "Curfew declared in Pune", "Train derailed today", "Free rations announced", "Earthquake in Delhi".
Action: Cross-reference strictly with TRUSTED_CONTEXT provided. Mark as TRUE if confirmed by credible sources, FAKE if contradicted, UNVERIFIED if no clear evidence. For sources, list the actual news source names and domains from TRUSTED_CONTEXT.

CATEGORY 3: "Opinion" - Subjective views, political commentary, predictions, personal beliefs.
Examples: "This policy is bad", "Team X will win", "Modi is the best PM ever".
Action: Do NOT fact-check. Mark status as OPINION, confidence_score 0. Explain it is subjective and cannot be fact-checked.

CRITICAL RULES:
- Do NOT output any emojis anywhere in your response.
- For General Facts, you MUST be confident. NEVER mark well-known facts as UNVERIFIED. If "Narendra Modi is the Prime Minister of India" is the claim, that is TRUE with 98-100 confidence.
- Provide explanation in 2-3 clear, concise sentences.
- Provide the same explanation in conversational Hindi.
- For sources: list domain names or reference types. For general facts, use authoritative reference types like "Official Government of India Records", "General Encyclopedias".

Output ONLY strict JSON. No markdown code blocks. No extra text before or after the JSON.
{
  "classification": "General Fact" | "Dynamic News" | "Opinion",
  "status": "TRUE" | "FAKE" | "UNVERIFIED" | "OPINION",
  "confidence_score": 0-100,
  "core_claim_extracted": "Short summary of the claim",
  "explanation_english": "2-3 concise sentences explaining the verdict with clear reasoning.",
  "explanation_hindi": "Same explanation in conversational Hindi.",
  "suggested_action": "Clear action advice for the user.",
  "sources": ["source1.com", "source2.com"]
}`;

    const userPrompt = `USER_CLAIM: ${userClaim}

TRUSTED_CONTEXT: ${JSON.stringify(trustedContext, null, 2)}`;

    try {
      const response = await this._callLLM(systemPrompt, userPrompt, LLM.MAX_TOKENS);

      let cleanedResponse = response
        .replace(/```json\n?|\n?```/g, '')
        .replace(/```\n?|\n?```/g, '')
        .trim();

      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanedResponse);

      if (!parsed.status || parsed.confidence_score === undefined || parsed.confidence_score === null) {
        throw new Error('Invalid LLM response structure');
      }

      if (!parsed.classification) {
        parsed.classification = 'Dynamic News';
      }

      if (!parsed.sources || !Array.isArray(parsed.sources)) {
        parsed.sources = [];
      }

      return parsed;
    } catch (error) {
      logger.error('LLM Verification Error:', error.message);

      return {
        classification: 'Dynamic News',
        status: 'UNVERIFIED',
        confidence_score: 0,
        core_claim_extracted: userClaim.substring(0, 80),
        explanation_english: 'Unable to verify at this time. Please check official sources.',
        explanation_hindi: 'Is samay satyapit karne mein asamarth. Kripya adhikarik srotron ki jaanch karein.',
        suggested_action: 'Wait and check official sources',
        sources: []
      };
    }
  }

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

  _callMock(systemPrompt, userPrompt) {
    logger.warn('Using MOCK LLM response');

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