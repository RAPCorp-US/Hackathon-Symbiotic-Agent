// functions/src/agents/communication/userMessageProcessor.ts
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { OpenAI } from 'openai';
import { getApiKeys } from '../../config/apiKeys';
import { MessageRouter } from '../../core/messageRouter';
import {
    MessageAnalysis,
    MessageClassification,
    ProcessedMessage,
    UserMessage
} from '../../models/communication.types';
import { Logger } from '../../utils/logger';


export class UserMessageProcessor {
    private openai: OpenAI;
    private agentId: string;
    private processingQueue: Map<string, Promise<any>> = new Map();
    private isProcessing: boolean = false;

    constructor(
        agentId: 'gpt5mini_1' | 'gpt5mini_2',
        private db: Firestore,
        private messageRouter: MessageRouter,
        private logger: Logger
    ) {
        this.agentId = agentId;

        this.logger.info(`[UserMessageProcessor] Initializing ${agentId}...`);

        try {
            const apiKeys = getApiKeys();
            this.logger.info(`[UserMessageProcessor] API keys retrieved for ${agentId}:`, {
                hasOpenAI: !!apiKeys.openai,
                openaiLength: apiKeys.openai ? apiKeys.openai.length : 0
            });

            if (!apiKeys.openai) {
                throw new Error(`OpenAI API key is missing for ${agentId}`);
            }

            this.openai = new OpenAI({ apiKey: apiKeys.openai });
            this.logger.info(`[UserMessageProcessor] OpenAI client created successfully for ${agentId}`);

            // Test that the client has the expected methods
            if (!this.openai || !this.openai.chat || !this.openai.chat.completions) {
                throw new Error(`OpenAI client not properly initialized for ${agentId}`);
            }

            this.logger.info(`[UserMessageProcessor] OpenAI client validation passed for ${agentId}`);
        } catch (error) {
            this.logger.error(`[UserMessageProcessor] Failed to initialize OpenAI client for ${agentId}:`, error);
            throw error;
        }

        this.initialize();
    }

    private initialize() {
        this.logger.info(`Initializing UserMessageProcessor ${this.agentId}`);
    }

    async processUserMessage(message: UserMessage): Promise<ProcessedMessage> {
        try {
            this.isProcessing = true;

            // Single comprehensive analysis and classification
            const { analysis, classification } = await this.analyzeAndClassifyMessage(message);

            // Report to O4-Mini
            await this.reportToDecisionEngine(analysis, classification);

            // Store processed message
            await this.storeProcessedMessage(message, analysis, classification);

            return {
                originalMessage: message,
                intent: analysis?.intent || 'help',
                entities: analysis?.entities || { tasks: [], users: [], technical_terms: [], files: [] },
                urgency: classification?.urgency || 'medium',
                suggestedAction: classification?.action || 'provide_help',
                agentId: this.agentId,
                processedAt: Date.now()
            };
        } finally {
            this.isProcessing = false;
        }
    }

    private async analyzeAndClassifyMessage(message: UserMessage): Promise<{
        analysis: MessageAnalysis;
        classification: MessageClassification;
    }> {
        const prompt = `
Analyze and classify this user message comprehensively:

MESSAGE: "${message.content}"
USER STATUS: ${message.context?.userStatus || 'active'}
HACKATHON CONTEXT: ${message.context?.hackathonId || 'unknown'}

Please wrap your JSON response in delimiters like this:
---ANALYSIS_JSON_START---
{
  "analysis": {
    "intent": "question|request|feedback|issue|help|status_update|collaboration",
    "entities": {
      "tasks": ["extracted task mentions"],
      "users": ["mentioned users/roles"],
      "technical_terms": ["technical concepts, frameworks, tools"],
      "files": ["mentioned files, paths, repositories"]
    },
    "emotional_tone": "positive|neutral|negative|frustrated|urgent",
    "requires_action": true/false,
    "action_type": "immediate|scheduled|none",
    "expertise_needed": ["required expertise areas"],
    "messageId": "${message.id}"
  },
  "classification": {
    "urgency": "critical|high|medium|low",
    "category": "technical|coordination|planning|help",
    "route_to": ["roadmap_orchestrator", "progress_coordinator", "code_extractor"],
    "action": "notify_team|update_roadmap|assign_help|provide_info|escalate",
    "confidence": 0.0-1.0
  }
}
---ANALYSIS_JSON_END---

Guidelines:
- Extract ALL relevant entities comprehensively
- Map intent accurately to user's actual need
- Set urgency based on blocking potential and time sensitivity
- Route to appropriate agents based on content type
- Provide actionable classification for coordination`;

        this.logger.info(`[UserMessageProcessor] Making OpenAI API call for message: ${message.id}`);

        // Defensive check to ensure OpenAI client is properly initialized
        if (!this.openai || !this.openai.chat || !this.openai.chat.completions || typeof this.openai.chat.completions.create !== 'function') {
            this.logger.error(`[UserMessageProcessor] OpenAI client not properly initialized`, {
                hasOpenai: !!this.openai,
                hasChat: !!(this.openai && this.openai.chat),
                hasCompletions: !!(this.openai && this.openai.chat && this.openai.chat.completions),
                hasCreateMethod: !!(this.openai && this.openai.chat && this.openai.chat.completions && typeof this.openai.chat.completions.create === 'function')
            });
            throw new Error('OpenAI client not properly initialized - cannot make API call');
        }

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_completion_tokens: 500
        });

        this.logger.info(`[UserMessageProcessor] OpenAI API response received:`, {
            messageId: message.id,
            choices: response.choices?.length || 0,
            finishReason: response.choices[0]?.finish_reason,
            usage: response.usage
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            this.logger.error(`[UserMessageProcessor] No response content received from OpenAI for message: ${message.id}`);
            throw new Error('No response content received from OpenAI for message analysis');
        }

        this.logger.info(`[UserMessageProcessor] Raw OpenAI response content for message ${message.id}:`, {
            contentLength: content.length,
            contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
            hasDelimiters: content.includes('---ANALYSIS_JSON_START---') && content.includes('---ANALYSIS_JSON_END---')
        });

        try {
            // Extract JSON using delimited approach
            this.logger.info(`[UserMessageProcessor] Attempting to extract delimited JSON for message: ${message.id}`);
            const jsonMatch = content.match(/---ANALYSIS_JSON_START---([\s\S]*?)---ANALYSIS_JSON_END---/);

            if (!jsonMatch || !jsonMatch[1]) {
                this.logger.error(`[UserMessageProcessor] No delimited JSON found in response for message: ${message.id}`, {
                    hasStartDelimiter: content.includes('---ANALYSIS_JSON_START---'),
                    hasEndDelimiter: content.includes('---ANALYSIS_JSON_END---'),
                    fullContent: content
                });
                throw new Error('AI response missing required JSON delimiters');
            }

            const jsonString = jsonMatch[1].trim();
            this.logger.info(`[UserMessageProcessor] Extracted JSON string for message ${message.id}:`, {
                jsonLength: jsonString.length,
                jsonContent: jsonString
            });

            const result = JSON.parse(jsonString);
            this.logger.info(`[UserMessageProcessor] Successfully parsed JSON for message ${message.id}:`, {
                hasAnalysis: !!result.analysis,
                hasClassification: !!result.classification,
                analysisIntent: result.analysis?.intent,
                classificationUrgency: result.classification?.urgency
            });

            return {
                analysis: result.analysis,
                classification: result.classification
            };
        } catch (parseError) {
            const error = parseError instanceof Error ? parseError : new Error(String(parseError));
            this.logger.error(`[UserMessageProcessor] Failed to parse JSON response for message ${message.id}:`, {
                error: error.message,
                rawContent: content,
                stack: error.stack
            });
            console.error('Failed to parse JSON response:', content);
            console.error('Parse error:', parseError);

            // Return fallback response
            this.logger.info(`[UserMessageProcessor] Returning fallback response for message: ${message.id}`);
            return {
                analysis: {
                    intent: 'help',
                    entities: { tasks: [], users: [], technical_terms: [], files: [] },
                    emotional_tone: 'neutral',
                    requires_action: true,
                    action_type: 'immediate',
                    expertise_needed: ['general'],
                    messageId: 'fallback'
                },
                classification: {
                    urgency: 'medium',
                    category: 'help',
                    route_to: ['decision_engine'],
                    action: 'provide_help',
                    confidence: 0.5
                }
            };
        }
    }

    private async reportToDecisionEngine(
        analysis: MessageAnalysis,
        classification: MessageClassification
    ) {
        await this.messageRouter.sendMessage({
            type: 'USER_COMMUNICATION',
            source: `user_message_processor_${this.agentId}`,
            target: 'decision_engine',
            payload: {
                analysis,
                classification,
                timestamp: Date.now()
            },
            priority: this.mapUrgencyToPriority(classification.urgency),
            timestamp: Date.now(),
            correlationId: analysis.messageId
        });
    }

    private mapUrgencyToPriority(urgency: string): number {
        const priorityMap: Record<string, number> = {
            critical: 1,
            high: 2,
            medium: 3,
            low: 4
        };
        return priorityMap[urgency] || 3;
    }

    private async storeProcessedMessage(
        message: UserMessage,
        analysis: MessageAnalysis,
        classification: MessageClassification
    ) {
        // Debug logging to identify undefined values
        this.logger.info(`[UserMessageProcessor] Storing message: ${message.id}`);
        this.logger.info(`[UserMessageProcessor] Message context:`, JSON.stringify(message.context, null, 2));

        // Check for undefined values before storing
        if (message.context) {
            const undefinedFields = Object.entries(message.context).filter(([key, value]) => value === undefined);
            if (undefinedFields.length > 0) {
                this.logger.warn(`[UserMessageProcessor] WARNING: Found undefined fields in message ${message.id}:`, undefinedFields);
                this.logger.warn(`[UserMessageProcessor] Full message context:`, message.context);
            }
        }

        // Filter out undefined values from context to prevent Firestore errors
        const cleanContext = message.context ?
            Object.fromEntries(Object.entries(message.context).filter(([key, value]) => value !== undefined)) :
            {};

        const cleanMessage = {
            ...message,
            context: cleanContext
        };

        await this.db.collection('processed_messages').add({
            ...cleanMessage,
            analysis,
            classification,
            processedBy: this.agentId,
            processedAt: Timestamp.now()
        });
    }

    isAvailable(): boolean {
        return !this.isProcessing && this.processingQueue.size < 5;
    }

    get queueSize(): number {
        return this.processingQueue.size;
    }
}
