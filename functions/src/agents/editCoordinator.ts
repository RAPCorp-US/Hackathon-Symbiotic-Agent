// functions/src/agents/editCoordinator.ts
import { Anthropic } from '@anthropic-ai/sdk';
import { Firestore } from '@google-cloud/firestore';
import { getApiKeys } from '../config/apiKeys';
import { MessageRouter } from '../core/messageRouter';
import { Logger } from '../utils/logger';

export class EditCoordinator {
    private anthropic: Anthropic;

    constructor(
        private db: Firestore,
        private messageRouter: MessageRouter,
        private logger: Logger
    ) {
        const apiKeys = getApiKeys();
        if (!apiKeys.claude) {
            this.logger.error('Claude API key not found');
            throw new Error('Claude API key not configured');
        }
        this.anthropic = new Anthropic({
            apiKey: apiKeys.claude,
        });
        this.initialize();
    }

    private initialize() {
        this.logger.info('Initializing Edit Coordinator');
        this.setupMessageHandlers();
    }

    private setupMessageHandlers() {
        this.messageRouter.on('CODE_EXTRACTED', async (message) => {
            await this.handleCodeExtracted(message.payload);
        });
    }

    private async handleCodeExtracted(payload: any) {
        const { extraction, context, requester } = payload;

        // Generate edit suggestions
        const suggestions = await this.generateEditSuggestions(extraction, context);

        // Create actionable recommendations
        const recommendations = await this.createRecommendations(suggestions, extraction);

        // Send recommendations to relevant users
        await this.distributeRecommendations(recommendations, requester);
    }

    private async generateEditSuggestions(extraction: any, context: any) {
        const prompt = `
    Generate code edit suggestions based on the extraction:
    
    Context: ${JSON.stringify(context, null, 2)}
    
    Extracted Code:
    ${JSON.stringify(extraction, null, 2)}
    
    Provide specific edit suggestions:
    1. Bug fixes
    2. Performance improvements
    3. Code quality enhancements
    4. Security improvements
    5. Refactoring opportunities
    
    For each suggestion, provide:
    - Specific line changes
    - Explanation of why the change is beneficial
    - Impact assessment
    - Implementation priority
    
    Please wrap your JSON response in delimiters like this:
    ---EDIT_JSON_START---
    {
      "suggestions": [
        {
          "type": "bug_fix|performance|quality|security|refactoring",
          "file": "path/to/file",
          "lineChanges": [
            {
              "line": number,
              "oldCode": "existing code",
              "newCode": "suggested code",
              "explanation": "why this change is beneficial"
            }
          ],
          "impactAssessment": "description",
          "priority": "high|medium|low"
        }
      ]
    }
    ---EDIT_JSON_END---`;

        try {
            this.logger.info('Making Claude API call for edit planning');

            if (!this.anthropic) {
                throw new Error('Anthropic client not initialized');
            }

            const response = await (this.anthropic as any).messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }]
            });

            const content = response.content[0];
            if (content?.type === 'text') {
                try {
                    // Extract JSON using delimited approach like userMessageProcessor
                    this.logger.info('Attempting to extract delimited JSON from Claude response');
                    const jsonMatch = content.text.match(/---EDIT_JSON_START---([\s\S]*?)---EDIT_JSON_END---/);

                    if (!jsonMatch || !jsonMatch[1]) {
                        this.logger.error('No delimited JSON found in Claude response', {
                            hasStartDelimiter: content.text.includes('---EDIT_JSON_START---'),
                            hasEndDelimiter: content.text.includes('---EDIT_JSON_END---'),
                            fullContent: content.text
                        });
                        throw new Error('Claude response missing required JSON delimiters');
                    }

                    const jsonString = jsonMatch[1].trim();
                    this.logger.info('Extracted JSON string from Claude response', {
                        jsonLength: jsonString.length,
                        jsonContent: jsonString
                    });

                    const result = JSON.parse(jsonString);
                    this.logger.info('Successfully parsed JSON from Claude response');
                    return result;
                } catch (parseError) {
                    this.logger.error('Failed to parse Claude response as JSON', parseError);
                    this.logger.error('Raw Claude response content:', content.text);

                    // Return fallback response like userMessageProcessor
                    return {
                        suggestions: [{
                            type: 'fallback',
                            file: 'unknown',
                            lineChanges: [],
                            impactAssessment: 'Failed to parse Claude response',
                            priority: 'low'
                        }]
                    };
                }
            } else {
                throw new Error('Unexpected response format from Claude');
            }
        } catch (error) {
            this.logger.error('Claude API call failed', error);
            throw error;
        }
    }

    private async createRecommendations(suggestions: any, extraction: any) {
        return {
            timestamp: Date.now(),
            suggestions,
            files: extraction.files,
            priority: this.calculatePriority(suggestions),
            estimatedEffort: this.estimateEffort(suggestions)
        };
    }

    private calculatePriority(suggestions: any): string {
        // Calculate based on severity and impact
        if (suggestions.some((s: any) => s.type === 'security' && s.severity === 'critical')) {
            return 'critical';
        }
        if (suggestions.some((s: any) => s.type === 'bug' && s.severity === 'high')) {
            return 'high';
        }
        return 'medium';
    }

    private estimateEffort(suggestions: any): number {
        // Simple effort estimation in hours
        let effort = 0;
        for (const suggestion of suggestions) {
            switch (suggestion.complexity) {
                case 'low': effort += 0.5; break;
                case 'medium': effort += 2; break;
                case 'high': effort += 5; break;
            }
        }
        return effort;
    }

    private async distributeRecommendations(recommendations: any, requester: string) {
        // Store recommendations
        await this.db.collection('edit_recommendations').add(recommendations);

        // Send to requester
        await this.messageRouter.sendMessage({
            type: 'EDIT_RECOMMENDATIONS',
            source: 'edit_coordinator',
            target: requester,
            payload: recommendations,
            priority: 2,
            timestamp: Date.now()
        });

        // Notify affected users
        const affectedUsers = await this.findAffectedUsers(recommendations.files);
        for (const userId of affectedUsers) {
            await this.db.collection('notifications').add({
                userId,
                type: 'edit_recommendations',
                recommendations,
                timestamp: Date.now()
            });
        }
    }

    private async findAffectedUsers(files: string[]): Promise<string[]> {
        const tasks = await this.db
            .collection('tasks')
            .where('files', 'array-contains-any', files)
            .get();

        const users = new Set<string>();
        tasks.docs.forEach(doc => {
            const task = doc.data();
            if (task.assignedTo) {
                task.assignedTo.forEach((u: string) => users.add(u));
            }
        });

        return Array.from(users);
    }
}
