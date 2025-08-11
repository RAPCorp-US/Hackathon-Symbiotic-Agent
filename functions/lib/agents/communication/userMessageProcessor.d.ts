import { Firestore } from '@google-cloud/firestore';
import { MessageRouter } from '../../core/messageRouter';
import { ProcessedMessage, UserMessage } from '../../models/communication.types';
import { Logger } from '../../utils/logger';
export declare class UserMessageProcessor {
    private db;
    private messageRouter;
    private logger;
    private openai;
    private agentId;
    private processingQueue;
    private isProcessing;
    constructor(agentId: 'gpt5mini_1' | 'gpt5mini_2', db: Firestore, messageRouter: MessageRouter, logger: Logger);
    private initialize;
    processUserMessage(message: UserMessage): Promise<ProcessedMessage>;
    private analyzeAndClassifyMessage;
    private reportToDecisionEngine;
    private mapUrgencyToPriority;
    private storeProcessedMessage;
    isAvailable(): boolean;
    get queueSize(): number;
}
