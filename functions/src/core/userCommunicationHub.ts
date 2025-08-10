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
    ): Promise<void> {
        const userMessage: UserMessage = {
            id: this.generateId(),
            userId,
            userName: await this.getUserName(userId),
            content: message,
            context: {
                ...context,
                currentTasks: await this.getUserCurrentTasks(userId),
                userStatus: await this.getUserStatus(userId)
            },
            timestamp: Date.now(),
            status: 'pending'
        };

        // Add to priority queue
        const priority = this.calculateMessagePriority(userMessage);
        this.messageQueue.enqueue(userMessage, priority);

        // Send acknowledgment
        this.sendAcknowledgment(userId, userMessage.id);
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
            const processed = await processor.processUserMessage(message);
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
        const responses: Record<string, string> = {
            help: "I've identified team members who can help with your issue. Connecting you now...",
            question: "Let me find that information for you...",
            feedback: "Thank you for your feedback. I've shared it with the team.",
            issue: "I've logged this issue and notified the relevant team members.",
            status_update: "Status update received. The progress map has been updated.",
            collaboration: "I'm setting up a collaboration session for you."
        };

        return responses[processed.intent] || "Message received and being processed.";
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
