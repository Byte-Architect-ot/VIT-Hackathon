const axios = require('axios');
const logger = require('../utils/logger');
const { LLM } = require('../config/constants');

class LLMService {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'openai';
    this.apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    this.model = process.env.LLM_MODEL || 'gpt-4-turbo-preview';

    if (this.apiKey && this.apiKey.startsWith('gsk_')) {
      this.provider = 'groq';
      if (this.model.startsWith('gpt')) {
        this.model = 'llama-3.3-70b-versatile';
      }
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

            return userText.substring(0, 100);
    }
  }

    async verifyClaim(userClaim, trustedContext) {
    const systemPrompt = `You are the "SatyaBot Verification Engine," an elite fact-checking AI designed to stop the spread of dangerous misinformation in India during crises. You are objective, highly analytical, and prioritize public safety.

Objective: Analyze the user's forwarded message, compare it against the provided real-time news context (fetched from trusted APIs), and determine its credibility.

Execution Rules:
1. If TRUSTED_CONTEXT explicitly disproves the USER_CLAIM, mark as FAKE.
2. If TRUSTED_CONTEXT explicitly confirms the USER_CLAIM, mark as TRUE.
3. If TRUSTED_CONTEXT is empty, unrelated, or inconclusive, mark as UNVERIFIED.
4. Keep explanations under 2 sentences. Be calm and authoritative. Avoid jargon.

Output Format: You must respond ONLY in strict JSON format. Do not include markdown code blocks.
{
  "status": "FAKE" | "TRUE" | "UNVERIFIED",
  "confidence_score": 0-100,
  "core_claim_extracted": "A 5-word summary of the rumor",
  "explanation_english": "A 1-2 sentence explanation of your verdict.",
  "explanation_hindi": "The exact same explanation translated into conversational Hindi.",
  "suggested_action": "e.g., 'Do not forward', 'Wait for official news'"
}`;

    const userPrompt = `USER_CLAIM: ${userClaim}

TRUSTED_CONTEXT: ${JSON.stringify(trustedContext, null, 2)}`;

    try {
      const response = await this._callLLM(systemPrompt, userPrompt, LLM.MAX_TOKENS);

            const cleanedResponse = response.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanedResponse);

            return parsed;
    } catch (error) {
      logger.error('LLM Verification Error:', error.message);

      return {
        status: 'UNVERIFIED',
        confidence_score: 0,
        core_claim_extracted: userClaim.substring(0, 50),
        explanation_english: 'System busy. Unable to verify at this time.',
        explanation_hindi: 'सिस्टम व्यस्त है। अभी सत्यापित नहीं कर सकते।',
        suggested_action: 'Wait and check official sources'
      };
    }
  }

    async _callLLM(systemPrompt, userPrompt, maxTokens) {
    if (this.provider === 'openai') {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: maxTokens,
          temperature: LLM.TEMPERATURE
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: LLM.TIMEOUT
        }
      );

      return response.data.choices[0].message.content;
    }

        if (this.provider === 'groq') {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: maxTokens,
          temperature: LLM.TEMPERATURE
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: LLM.TIMEOUT
        }
      );

      return response.data.choices[0].message.content;
    }

        throw new Error(`LLM provider not properly configured: ${this.provider}`);
  }
}

module.exports = new LLMService();