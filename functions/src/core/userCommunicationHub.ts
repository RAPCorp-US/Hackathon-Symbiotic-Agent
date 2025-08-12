// functions/src/core/userCommunicationHub.ts
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { Server as SocketServer } from 'socket.io';
import { UserMessageProcessor } from '../agents/communication/userMessageProcessor';
import { DecisionEngine } from '../agents/decisionEngine';
import { ProcessedMessage, UserMessage } from '../models/communication.types';
import { Logger } from '../utils/logger';
import { PriorityQueue } from '../utils/priorityQueue';
import { MessageRouter } from './messageRouter';

export class UserCommunicationHub {
    private processor1!: UserMessageProcessor;
    private processor2!: UserMessageProcessor;
    private messageQueue: PriorityQueue<UserMessage>;
    private io: SocketServer | null = null;
    private activeConnections: Map<string, any> = new Map();

    constructor(
        private db: Firestore,
        private messageRouter: MessageRouter,
        private decisionEngine: DecisionEngine,
        private logger: Logger
    ) {
        this.messageQueue = new PriorityQueue<UserMessage>();
        this.initializeProcessors();
        this.setupWebSocketServer();
        this.startQueueProcessor();
    }

    private initializeProcessors() {
        this.processor1 = new UserMessageProcessor(
            'gpt5mini_1',
            this.db,
            this.messageRouter,
            this.logger
        );

        this.processor2 = new UserMessageProcessor(
            'gpt5mini_2',
            this.db,
            this.messageRouter,
            this.logger
        );
    }

    private setupWebSocketServer() {
        // WebSocket setup for real-time communication
        if (typeof (global as any).window === 'undefined') {
            const { Server } = require('socket.io');
            this.io = new Server({
                cors: {
                    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
                    methods: ['GET', 'POST']
                }
            });

            if (this.io) {
                this.io.on('connection', (socket) => {
                    this.handleSocketConnection(socket);
                });
            }
        }
    }

    private handleSocketConnection(socket: any) {
        const userId = socket.handshake.query.userId;
        this.activeConnections.set(userId, socket);

        socket.on('message', async (data: any) => {
            await this.handleIncomingMessage(
                userId,
                data.message,
                data.context
            );
        });

        socket.on('disconnect', () => {
            this.activeConnections.delete(userId);
        });
    }

    async handleIncomingMessage(
        userId: string,
        message: string,
        context: any
    ): Promise<{ aiResponse?: string }> {
        const userMessage: UserMessage = {
            id: this.generateId(),
            userId,
            userName: await this.getUserName(userId),
            content: message,
            context: {
                // Preserve incoming context fields first
                ...context,
                // Then add/override with dynamic fields
                currentTasks: await this.getUserCurrentTasks(userId),
                userStatus: await this.getUserStatus(userId)
            },
            timestamp: Date.now(),
            status: 'pending'
        };

        // Process the message immediately for real-time response
        try {
            const processor = this.getAvailableProcessor();
            const processed = await processor.processUserMessage(userMessage);

            // Handle the processed message and generate response
            await this.handleProcessedMessage(processed);

            // Generate user response
            const aiResponse = await this.generateUserResponse(processed);

            return { aiResponse };
        } catch (error) {
            this.logger.error('Error processing message immediately:', error);

            // Fall back to queue-based processing
            const priority = this.calculateMessagePriority(userMessage);
            this.messageQueue.enqueue(userMessage, priority);

            // Send acknowledgment
            this.sendAcknowledgment(userId, userMessage.id);

            return { aiResponse: "I'm processing your message and will respond shortly." };
        }
    }

    private async startQueueProcessor() {
        setInterval(async () => {
            if (!this.messageQueue.isEmpty()) {
                const message = this.messageQueue.dequeue();
                if (message) {
                    const processor = this.getAvailableProcessor();
                    this.processMessage(processor, message);
                }
            }
        }, 100);
    }

    private async processMessage(
        processor: UserMessageProcessor,
        message: UserMessage
    ) {
        try {
            this.logger.info('[UserCommunicationHub] About to call processUserMessage for message:', message.id);
            const processed = await processor.processUserMessage(message);

            this.logger.info('[UserCommunicationHub] processUserMessage returned:', {
                processedExists: !!processed,
                processedType: typeof processed,
                intentExists: !!processed?.intent,
                intent: processed?.intent,
                urgency: processed?.urgency,
                agentId: processed?.agentId,
                processedAt: processed?.processedAt,
                originalMessageId: processed?.originalMessage?.id
            });

            await this.handleProcessedMessage(processed);
        } catch (error) {
            this.logger.error('Error processing message:', error);
            await this.handleProcessingError(error as Error, message);
        }
    }

    private getAvailableProcessor(): UserMessageProcessor {
        // Load balancing with fallback
        if (this.processor1.isAvailable()) {
            if (!this.processor2.isAvailable()) {
                return this.processor1;
            }
            // Round-robin when both available
            return this.processor1.queueSize <= this.processor2.queueSize
                ? this.processor1
                : this.processor2;
        }
        return this.processor2;
    }

    private async handleProcessedMessage(processed: ProcessedMessage) {
        this.logger.info('[UserCommunicationHub] handleProcessedMessage called with:', {
            processedExists: !!processed,
            processedType: typeof processed,
            intentExists: !!processed?.intent,
            intent: processed?.intent,
            urgency: processed?.urgency,
            agentId: processed?.agentId,
            processedAt: processed?.processedAt,
            originalMessageId: processed?.originalMessage?.id
        });

        // Safety check for processed message
        if (!processed || !processed.intent) {
            this.logger.error('Invalid processed message received:', {
                processed: processed ? JSON.stringify(processed, null, 2) : 'null/undefined',
                intentMissing: !processed?.intent,
                processedMissing: !processed
            });
            return;
        }

        this.logger.info('[UserCommunicationHub] About to call generateRecommendations with valid processed message');

        // Generate recommendations
        const recommendations = await this.generateRecommendations(processed);

        // Send to O4-Mini for decision making
        await this.messageRouter.sendMessage({
            type: 'USER_COMMUNICATION',
            source: 'user_communication_hub',
            target: 'decision_engine',
            payload: {
                processedMessage: processed,
                recommendedActions: recommendations,
                affectedUsers: await this.identifyAffectedUsers(processed)
            },
            priority: this.determinePriority(processed),
            timestamp: Date.now()
        });

        // Send response to user
        await this.sendUserResponse(processed);
    }

    private async generateRecommendations(processed: ProcessedMessage): Promise<any> {
        // Enhanced debugging for undefined intent issue
        this.logger.info('[UserCommunicationHub] generateRecommendations called with:', {
            processedExists: !!processed,
            processedType: typeof processed,
            processedKeys: processed ? Object.keys(processed) : 'N/A',
            intent: processed?.intent,
            intentType: typeof processed?.intent,
            urgency: processed?.urgency,
            urgencyType: typeof processed?.urgency,
            agentId: processed?.agentId,
            processedAt: processed?.processedAt
        });

        if (!processed) {
            this.logger.error('[UserCommunicationHub] ProcessedMessage is null or undefined');
            return [];
        }

        if (!processed.intent) {
            this.logger.error('[UserCommunicationHub] ProcessedMessage.intent is undefined:', {
                processed: JSON.stringify(processed, null, 2)
            });
            return [];
        }

        const recommendations = [];

        if (processed.intent === 'help') {
            const helpers = await this.findUsersWithExpertise(processed.entities);
            recommendations.push({
                action: 'connect_with_expert',
                targets: helpers,
                message: `Connect ${processed.originalMessage.userName} with experts`
            });
        }

        if (processed.urgency === 'critical') {
            recommendations.push({
                action: 'escalate_to_coordinator',
                priority: 'immediate'
            });
        }

        if (processed.intent === 'collaboration') {
            recommendations.push({
                action: 'initiate_collaboration',
                type: 'team_sync'
            });
        }

        return recommendations;
    }

    private async sendUserResponse(processed: ProcessedMessage) {
        console.log('sendUserResponse called with processed:', {
            keys: processed ? Object.keys(processed) : 'undefined',
            userId: processed?.originalMessage?.userId
        });

        if (!processed) {
            console.error('sendUserResponse: processed is undefined');
            return;
        }

        if (!processed.originalMessage?.userId) {
            console.error('sendUserResponse: no userId in processed.originalMessage', processed);
            return;
        }

        const socket = this.activeConnections.get(processed.originalMessage.userId);
        if (socket) {
            socket.emit('response', {
                messageId: processed.originalMessage.id,
                response: await this.generateUserResponse(processed),
                timestamp: Date.now()
            });
        }
    }

    private async generateUserResponse(processed: ProcessedMessage): Promise<string> {
        console.log('generateUserResponse called with processed:', {
            keys: processed ? Object.keys(processed) : 'undefined',
            intent: processed?.intent,
            hasIntent: processed && 'intent' in processed
        });

        if (!processed) {
            console.error('generateUserResponse: processed is undefined');
            return "Message received and being processed.";
        }

        if (!processed.intent) {
            console.error('generateUserResponse: processed.intent is undefined', {
                processed,
                keys: Object.keys(processed)
            });
            return "Message received and being processed.";
        }

        // SIMPLE SOLUTION: Just get the coordination analysis and return it directly!
        try {
            this.logger.info('Getting recent coordination analysis for user response...');

            // Wait a moment for coordination analysis to complete
            await new Promise(resolve => setTimeout(resolve, 3000));

            const recentAnalysis = await this.getRecentCoordinationAnalysis();
            if (recentAnalysis) {
                this.logger.info('Found coordination analysis, returning formatted response');

                // Format the rich analysis for the user
                let response = "🚀 **AI Project Analysis**\n\n";

                response += `📊 **Status**: ${recentAnalysis.status?.toUpperCase() || 'ANALYZING'}\n`;
                response += `📈 **Progress**: ${recentAnalysis.overallProgress || 0}%\n\n`;

                if (recentAnalysis.bottlenecks?.length > 0) {
                    response += "⚠️ **Critical Bottlenecks**:\n";
                    recentAnalysis.bottlenecks.forEach((item: string, i: number) => {
                        response += `${i + 1}. ${item}\n`;
                    });
                    response += "\n";
                }

                if (recentAnalysis.recommendations?.length > 0) {
                    response += "💡 **Immediate Action Items**:\n";
                    recentAnalysis.recommendations.forEach((item: string, i: number) => {
                        response += `${i + 1}. ${item}\n`;
                    });
                    response += "\n";
                }

                if (recentAnalysis.collaborationOpportunities?.length > 0) {
                    response += "🤝 **Collaboration Opportunities**:\n";
                    recentAnalysis.collaborationOpportunities.forEach((item: string, i: number) => {
                        response += `${i + 1}. ${item}\n`;
                    });
                    response += "\n";
                }

                if (recentAnalysis.criticalIssues?.length > 0) {
                    response += "🚨 **Critical Issues**:\n";
                    recentAnalysis.criticalIssues.forEach((item: string, i: number) => {
                        response += `${i + 1}. ${item}\n`;
                    });
                }

                return response;
            } else {
                this.logger.warn('No coordination analysis found, using fallback');
            }
        } catch (error) {
            this.logger.error('Failed to get coordination analysis:', error);
        }

        // Fallback responses
        const responses: Record<string, string> = {
            help: "I'm analyzing your project status and will provide detailed insights shortly...",
            question: "Let me find that information for you...",
            feedback: "Thank you for your feedback. I've shared it with the team.",
            issue: "I've logged this issue and notified the relevant team members.",
            status_update: "Status update received. The progress map has been updated.",
            collaboration: "I'm setting up a collaboration session for you."
        };

        return responses[processed.intent] || "Message received and being processed.";
    }

    private async getRecentCoordinationAnalysis(): Promise<any> {
        try {
            this.logger.info('Attempting to get recent coordination analysis from global state...');

            // Get the current global state where coordination analysis is stored
            const globalStateDoc = await this.db.collection('global_state').doc('current').get();

            this.logger.info('Global state document query result:', {
                exists: globalStateDoc.exists,
                hasData: globalStateDoc.exists && !!globalStateDoc.data()
            });

            if (globalStateDoc.exists) {
                const globalStateData = globalStateDoc.data();
                this.logger.info('Global state data structure:', {
                    hasGlobalStateData: !!globalStateData,
                    keys: globalStateData ? Object.keys(globalStateData) : [],
                    hasCoordination: !!(globalStateData && globalStateData.coordination),
                    coordinationKeys: globalStateData?.coordination ? Object.keys(globalStateData.coordination) : []
                });

                if (globalStateData && globalStateData.coordination) {
                    this.logger.info('Found recent coordination analysis:', {
                        hasAnalysis: !!globalStateData.coordination,
                        status: globalStateData.coordination.status,
                        issuesCount: globalStateData.coordination.criticalIssues?.length || 0,
                        recommendationsCount: globalStateData.coordination.recommendations?.length || 0,
                        timestamp: globalStateData.coordination.timestamp
                    });
                    return globalStateData.coordination;
                }
            }

            this.logger.info('No coordination analysis found in global state');
        } catch (error) {
            this.logger.error('Error getting recent coordination analysis:', error);
        }
        return null;
    }

    private formatCoordinationAnalysisForUser(analysis: any): string {
        if (!analysis) return "I'm analyzing your project status...";

        let response = "📊 **Project Analysis & Recommendations**\n\n";

        // Overall status
        response += `🔍 **Status**: ${analysis.status?.toUpperCase() || 'UNKNOWN'}\n`;
        response += `📈 **Progress**: ${analysis.overallProgress || 0}%\n\n`;

        // Critical issues
        if (analysis.criticalIssues && analysis.criticalIssues.length > 0) {
            response += "🚨 **Critical Issues**:\n";
            analysis.criticalIssues.slice(0, 3).forEach((issue: string, index: number) => {
                response += `${index + 1}. ${issue}\n`;
            });
            response += "\n";
        }

        // Bottlenecks
        if (analysis.bottlenecks && analysis.bottlenecks.length > 0) {
            response += "⚠️ **Key Bottlenecks**:\n";
            analysis.bottlenecks.slice(0, 3).forEach((bottleneck: string, index: number) => {
                response += `${index + 1}. ${bottleneck}\n`;
            });
            response += "\n";
        }

        // Recommendations
        if (analysis.recommendations && analysis.recommendations.length > 0) {
            response += "💡 **Action Recommendations**:\n";
            analysis.recommendations.slice(0, 5).forEach((rec: string, index: number) => {
                response += `${index + 1}. ${rec}\n`;
            });
            response += "\n";
        }

        // Collaboration opportunities
        if (analysis.collaborationOpportunities && analysis.collaborationOpportunities.length > 0) {
            response += "🤝 **Collaboration Opportunities**:\n";
            analysis.collaborationOpportunities.slice(0, 3).forEach((opp: string, index: number) => {
                response += `${index + 1}. ${opp}\n`;
            });
        }

        return response || "I'm analyzing your project and will provide insights shortly.";
    }

    private calculateMessagePriority(message: UserMessage): number {
        // Keywords that indicate urgency
        const urgentKeywords = ['blocked', 'critical', 'urgent', 'help', 'error', 'broken'];
        const hasUrgentKeyword = urgentKeywords.some(keyword =>
            message.content.toLowerCase().includes(keyword)
        );

        if (hasUrgentKeyword) return 1;
        if (message.context?.userStatus === 'blocked') return 2;
        return 3;
    }

    private async getUserName(userId: string): Promise<string> {
        const user = await this.db.collection('users').doc(userId).get();
        return user.data()?.name || 'Unknown User';
    }

    private async getUserCurrentTasks(userId: string): Promise<any[]> {
        const tasks = await this.db
            .collection('tasks')
            .where('assignedTo', '==', userId)
            .where('status', 'in', ['in_progress', 'pending'])
            .get();

        return tasks.docs.map(doc => doc.data());
    }

    private async getUserStatus(userId: string): Promise<string> {
        const user = await this.db.collection('users').doc(userId).get();
        return user.data()?.status || 'active';
    }

    private async findUsersWithExpertise(entities: any): Promise<string[]> {
        const technicalTerms = entities.technical_terms || [];
        if (technicalTerms.length === 0) return [];

        const users = await this.db
            .collection('users')
            .where('skills', 'array-contains-any', technicalTerms)
            .get();

        return users.docs.map(doc => doc.id);
    }

    private async identifyAffectedUsers(processed: ProcessedMessage): Promise<string[]> {
        const affected = new Set<string>();

        // Add mentioned users
        if (processed.entities.users) {
            processed.entities.users.forEach((user: string) => affected.add(user));
        }

        // Add users working on mentioned tasks
        if (processed.entities.tasks) {
            for (const taskName of processed.entities.tasks) {
                const task = await this.db
                    .collection('tasks')
                    .where('name', '==', taskName)
                    .get();

                task.docs.forEach(doc => {
                    const assignedTo = doc.data().assignedTo;
                    if (assignedTo) affected.add(assignedTo);
                });
            }
        }

        return Array.from(affected);
    }

    private determinePriority(processed: ProcessedMessage): number {
        const priorityMap: Record<string, number> = {
            critical: 1,
            high: 2,
            medium: 3,
            low: 4
        };
        return priorityMap[processed.urgency] || 3;
    }

    private sendAcknowledgment(userId: string, messageId: string) {
        const socket = this.activeConnections.get(userId);
        if (socket) {
            socket.emit('acknowledgment', {
                messageId,
                status: 'received',
                timestamp: Date.now()
            });
        }
    }

    private async handleProcessingError(error: Error, message: UserMessage) {
        this.logger.error(`Error processing message ${message.id}:`, error);

        // Store error
        await this.db.collection('processing_errors').add({
            messageId: message.id,
            error: error.message,
            timestamp: Timestamp.now()
        });

        // Notify user
        const socket = this.activeConnections.get(message.userId);
        if (socket) {
            socket.emit('error', {
                messageId: message.id,
                error: 'Failed to process message. Please try again.',
                timestamp: Date.now()
            });
        }
    }

    private generateId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
