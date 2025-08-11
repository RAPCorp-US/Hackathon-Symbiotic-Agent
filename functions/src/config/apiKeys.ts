// functions/src/config/apiKeys.ts
import * as functions from 'firebase-functions';

/**
 * Get API keys from Firebase Functions configuration
 * These are set using: firebase functions:config:set
 */
export function getApiKeys() {
    const config = functions.config();

    return {
        openai: config.openai?.api_key || process.env.OPENAI_API_KEY,
        gemini: config.gemini?.api_key || process.env.GEMINI_API_KEY,
        claude: config.claude?.api_key || process.env.CLAUDE_API_KEY
    };
}

/**
 * Validate that all required API keys are available
 */
export function validateApiKeys() {
    const keys = getApiKeys();
    const missing: string[] = [];

    if (!keys.openai) missing.push('OpenAI');
    if (!keys.gemini) missing.push('Gemini');
    if (!keys.claude) missing.push('Claude');

    if (missing.length > 0) {
        throw new Error(`Missing API keys for: ${missing.join(', ')}. Please configure using firebase functions:config:set`);
    }

    return keys;
}
