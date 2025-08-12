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
        const apiKeys = getApiKeys();
        this.openai = new OpenAI({ apiKey: apiKeys.openai });
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
                intent: analysis.intent,
                entities: analysis.entities,
                urgency: classification.urgency,
                suggestedAction: classification.action,
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

Return a JSON response with BOTH analysis and classification:

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

Guidelines:
- Extract ALL relevant entities comprehensively
- Map intent accurately to user's actual need
- Set urgency based on blocking potential and time sensitivity
- Route to appropriate agents based on content type
- Provide actionable classification for coordination`;

        const response = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_completion_tokens: 500,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response content received from OpenAI for message analysis');
        }

        const result = JSON.parse(content);
        return {
            analysis: result.analysis,
            classification: result.classification
        };
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
