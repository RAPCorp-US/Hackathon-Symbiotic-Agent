// functions/src/config/apiKeys.ts
import * as functions from 'firebase-functions';

/**
 * Get API keys from Firebase Functions configuration
 * These are set using: firebase functions:config:set
 */
export function getApiKeys() {
    console.log('🔑 Getting API keys from Firebase Functions config...');

    const config = functions.config();
    console.log('🔑 Firebase config available:', {
        hasOpenai: !!config.openai,
        hasGemini: !!config.gemini,
        hasClaude: !!config.claude
    });

    const keys = {
        openai: config.openai?.api_key || '',
        gemini: config.gemini?.api_key || '',
        claude: config.claude?.api_key || ''
    };

    console.log('🔑 Retrieved API keys:', {
        openaiPresent: !!keys.openai,
        openaiLength: keys.openai ? keys.openai.length : 0,
        geminiPresent: !!keys.gemini,
        geminiLength: keys.gemini ? keys.gemini.length : 0,
        claudePresent: !!keys.claude,
        claudeLength: keys.claude ? keys.claude.length : 0
    });

    return keys;
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
