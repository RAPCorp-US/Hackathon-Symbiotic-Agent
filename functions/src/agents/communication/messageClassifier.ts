// functions/src/agents/communication/messageClassifier.ts
import { OpenAI } from 'openai';
import { getApiKeys } from '../../config/apiKeys';
import { MessageClassification } from '../../models/communication.types';

export class MessageClassifier {
    private openai: OpenAI;
    private classificationCache: Map<string, MessageClassification> = new Map();

    constructor() {
        const apiKeys = getApiKeys();
        this.openai = new OpenAI({ apiKey: apiKeys.openai });
    }

    async classifyMessage(content: string, context: any): Promise<MessageClassification> {
        // Check cache first
        const cacheKey = this.generateCacheKey(content);
        if (this.classificationCache.has(cacheKey)) {
            return this.classificationCache.get(cacheKey)!;
        }

        const prompt = `
    Classify this hackathon participant message:
    
    Message: ${content}
    Context: ${JSON.stringify(context)}
    
    Classify based on:
    1. Urgency (critical/high/medium/low)
    2. Category (technical/coordination/planning/help)
    3. Required routing (which agents should handle)
    4. Action needed
    5. Confidence level
    
    Return as JSON:
    {
      "urgency": "critical|high|medium|low",
      "category": "technical|coordination|planning|help",
      "route_to": ["agent_names"],
      "action": "specific_action",
      "confidence": 0.0-1.0,
      "keywords": ["extracted", "keywords"],
      "sentiment": "positive|neutral|negative|urgent"
    }`;

        const response = await this.openai.chat.completions.create({
            model: 'gpt-5-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 300,
            response_format: { type: 'json_object' }
        });

        const responseContent = response.choices[0]?.message?.content;
        if (!responseContent) {
            throw new Error('No response content received from OpenAI');
        }
        const classification = JSON.parse(responseContent);

        // Cache the result
        this.classificationCache.set(cacheKey, classification);

        // Clear cache if too large
        if (this.classificationCache.size > 1000) {
            const firstKey = this.classificationCache.keys().next().value;
            if (firstKey !== undefined) {
                this.classificationCache.delete(firstKey);
            }
        }

        return classification;
    }

    async batchClassify(messages: string[]): Promise<MessageClassification[]> {
        const promises = messages.map(msg => this.classifyMessage(msg, {}));
        return Promise.all(promises);
    }

    private generateCacheKey(content: string): string {
        // Simple hash for caching
        return content.substring(0, 50).toLowerCase().replace(/\s+/g, '_');
    }

    clearCache() {
        this.classificationCache.clear();
    }
}
