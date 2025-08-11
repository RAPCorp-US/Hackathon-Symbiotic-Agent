// functions/src/models/communication.types.ts
export interface UserMessage {
    id: string;
    userId: string;
    userName: string;
    content: string;
    context: MessageContext;
    timestamp: number;
    status: 'pending' | 'processing' | 'processed' | 'failed';
}

export interface MessageContext {
    currentView?: string;
    activeTask?: string;
    currentTasks?: any[];
    userStatus?: string;
    sessionId?: string;
    hackathonId?: string;
    projectId?: string;  // Add projectId field
}

export interface MessageAnalysis {
    messageId?: string;
    intent: 'question' | 'request' | 'feedback' | 'issue' | 'help' | 'status_update' | 'collaboration';
    entities: {
        tasks: string[];
        users: string[];
        technical_terms: string[];
        files: string[];
    };
    emotional_tone: 'frustrated' | 'neutral' | 'positive' | 'urgent' | 'confused';
    requires_action: boolean;
    action_type: 'immediate' | 'scheduled' | 'informational' | 'none';
    expertise_needed: string[];
}

export interface MessageClassification {
    urgency: 'critical' | 'high' | 'medium' | 'low';
    category: 'technical' | 'coordination' | 'planning' | 'help';
    route_to: string[];
    action: string;
    confidence: number;
}

export interface ProcessedMessage {
    originalMessage: UserMessage;
    intent: string;
    entities: any;
    urgency: string;
    suggestedAction: string;
    agentId: string;
    processedAt: number;
}
