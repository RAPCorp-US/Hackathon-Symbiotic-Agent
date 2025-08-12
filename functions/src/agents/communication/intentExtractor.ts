// functions/src/agents/communication/intentExtractor.ts
import { OpenAI } from 'openai';
import { getApiKeys } from '../../config/apiKeys';

export interface ExtractedIntent {
    primary: string;
    secondary: string[];
    entities: {
        tasks: string[];
        users: string[];
        technical: string[];
        files: string[];
        deadlines: string[];
    };
    actionRequired: boolean;
    expertise: string[];
}

export class IntentExtractor {
    private openai: OpenAI;

    constructor() {
        const apiKeys = getApiKeys();
        this.openai = new OpenAI({ apiKey: apiKeys.openai });
    }

    async extractIntent(message: string, context: any): Promise<ExtractedIntent> {
        const prompt = `
    Extract intent and entities from this hackathon message:
    
    Message: ${message}
    User Context: ${JSON.stringify(context)}
    
    Extract:
    1. Primary intent (main purpose of message)
    2. Secondary intents (additional purposes)
    3. Named entities:
       - Task names
       - User mentions
       - Technical terms
       - File paths
       - Deadlines or time references
    4. Whether action is required
    5. Expertise areas needed
    
    Return as JSON:
    {
      "primary": "help|question|update|request|feedback|blocker|collaboration",
      "secondary": ["additional", "intents"],
      "entities": {
        "tasks": ["task names"],
        "users": ["@mentions or names"],
        "technical": ["technologies", "frameworks"],
        "files": ["file.paths"],
        "deadlines": ["time references"]
      },
      "actionRequired": true/false,
      "expertise": ["required", "skills"]
    }`;

        const response = await this.openai.chat.completions.create({
            model: 'gpt-5-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_completion_tokens: 400,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response content received from OpenAI');
        }
        return JSON.parse(content);
    }

    async extractMultipleIntents(messages: string[]): Promise<ExtractedIntent[]> {
        const promises = messages.map(msg => this.extractIntent(msg, {}));
        return Promise.all(promises);
    }

    async identifyBlockers(message: string): Promise<any> {
        const prompt = `
    Identify any blockers mentioned in this message:
    
    Message: ${message}
    
    Look for:
    - Technical blockers
    - Dependency blockers
    - Resource blockers
    - Knowledge gaps
    
    Return as JSON with blocker details and severity.`;

        const response = await this.openai.chat.completions.create({
            model: 'gpt-5-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_completion_tokens: 300
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response content received from OpenAI');
        }
        return JSON.parse(content);
    }
}
