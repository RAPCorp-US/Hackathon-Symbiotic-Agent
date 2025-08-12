// functions/src/agents/decisionEngine.ts
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { OpenAI } from 'openai';
import { getApiKeys } from '../config/apiKeys';
import { MessageRouter } from '../core/messageRouter';
import { AgentMessage } from '../models/types';
import { Logger } from '../utils/logger';

interface DecisionInput {
    userIntent: string;
    currentState: SystemState;
    recommendations: any[];
    urgency: string;
    processedMessage?: any;
}

interface SystemState {
    activeUsers: number;
    tasksInProgress: number;
    completionRate: number;
    blockedTasks: string[];
    criticalIssues: string[];
}

export class DecisionEngine {
    private openai: OpenAI;
    private continuousMonitoringInterval: NodeJS.Timeout | null = null;
    private scannerAllocationCache: Map<string, number> = new Map();

    constructor(
        private db: Firestore,
        private messageRouter: MessageRouter,
        private logger: Logger
    ) {
        const apiKeys = getApiKeys();
        this.openai = new OpenAI({ apiKey: apiKeys.openai });
        this.initialize();
    }

    private initialize() {
        this.startContinuousMonitoring();
        this.setupMessageHandlers();
    }

    private setupMessageHandlers() {
        this.messageRouter.on('USER_COMMUNICATION', (message) => {
            this.handleUserCommunication(message);
        });

        this.messageRouter.on('PROGRESS_UPDATE', (message) => {
            this.handleProgressUpdate(message);
        });

        this.messageRouter.on('SCANNER_REQUEST', (message) => {
            this.handleScannerAllocation(message);
        });
    }

    private async handleUserCommunication(message: AgentMessage) {
        console.log('DecisionEngine handleUserCommunication called with message:', {
            hasPayload: !!message.payload,
            payloadKeys: message.payload ? Object.keys(message.payload) : 'undefined'
        });

        const { processedMessage, recommendedActions, affectedUsers } = message.payload;

        console.log('DecisionEngine extracted processedMessage:', {
            hasProcessedMessage: !!processedMessage,
            processedMessageKeys: processedMessage ? Object.keys(processedMessage) : 'undefined',
            intent: processedMessage?.intent
        });

        if (!processedMessage) {
            console.error('DecisionEngine: processedMessage is undefined');
            return;
        }

        if (!processedMessage.intent) {
            console.error('DecisionEngine: processedMessage.intent is undefined', {
                processedMessage,
                keys: Object.keys(processedMessage)
            });
            return;
        }

        // Get current system state
        const currentState = await this.getCurrentSystemState();

        // Make informed decision incorporating user feedback
        const decision = await this.makeInformedDecision({
            userIntent: processedMessage.intent,
            currentState,
            recommendations: recommendedActions,
            urgency: processedMessage.urgency,
            processedMessage
        });

        // Execute decision
        await this.executeDecision(decision);

        // Update roadmap if needed
        if (decision.requiresRoadmapUpdate) {
            await this.sendRoadmapUpdate(decision, processedMessage);
        }

        // Notify affected users
        if (affectedUsers && affectedUsers.length > 0) {
            await this.notifyAffectedUsers(affectedUsers, decision);
        }

        // Update monitoring context
        this.updateMonitoringContext({
            userFeedback: processedMessage,
            decision,
            timestamp: Date.now()
        });
    }

    private async makeInformedDecision(input: DecisionInput) {
        const prompt = `
    O4-Mini Strategic Decision Required:
    
    User Communication:
    - Intent: ${input.userIntent}
    - Urgency: ${input.urgency}
    - Details: ${JSON.stringify(input.processedMessage?.entities || {})}
    
    System State:
    - Active Users: ${input.currentState.activeUsers}
    - Tasks in Progress: ${input.currentState.tasksInProgress}
    - Completion Rate: ${input.currentState.completionRate}%
    - Blocked Tasks: ${input.currentState.blockedTasks.length}
    - Critical Issues: ${input.currentState.criticalIssues.length}
    
    Recommended Actions:
    ${JSON.stringify(input.recommendations, null, 2)}
    
    Determine:
    1. Should we adjust current strategy?
    2. Which agents need to be notified?
    3. What immediate actions are required?
    4. How does this affect resource allocation?
    5. Should we trigger a collaboration session?
    6. Does the roadmap need updating?
    
    Return as JSON with structure:
    {
      "decision": "string describing the decision",
      "actions": [
        {
          "type": "notify|allocate|collaborate|update",
          "target": "agent or user identifier",
          "details": {}
        }
      ],
      "resourceAllocation": {
        "scanners": number,
        "focusArea": "string"
      },
      "requiresRoadmapUpdate": boolean,
      "roadmapChanges": {},
      "collaborationNeeded": boolean,
      "notifyAgents": ["agent1", "agent2"],
      "priority": "immediate|high|normal|low",
      "reasoning": "explanation of decision"
    }`;

        const response = await this.openai.chat.completions.create({
            model: 'o4-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_completion_tokens: 1000,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response content received from OpenAI');
        }
        return JSON.parse(content);
    }

    private async executeDecision(decision: any) {
        this.logger.info('Executing decision:', decision);

        // Process each action
        for (const action of decision.actions) {
            switch (action.type) {
                case 'notify':
                    await this.sendNotification(action.target, action.details);
                    break;
                case 'allocate':
                    await this.allocateResources(action.target, action.details);
                    break;
                case 'collaborate':
                    await this.initiateCollaboration(action.details);
                    break;
                case 'update':
                    await this.updateComponent(action.target, action.details);
                    break;
            }
        }

        // Update scanner allocation if needed
        if (decision.resourceAllocation) {
            await this.updateScannerAllocation(decision.resourceAllocation);
        }

        // Notify relevant agents
        if (decision.notifyAgents) {
            for (const agent of decision.notifyAgents) {
                await this.notifyAgent(agent, decision);
            }
        }
    }

    private async sendRoadmapUpdate(decision: any, processedMessage: any) {
        await this.messageRouter.sendMessage({
            type: 'ROADMAP_UPDATE',
            source: 'decision_engine',
            target: 'roadmap_orchestrator',
            payload: {
                decision,
                userFeedback: processedMessage,
                suggestedChanges: decision.roadmapChanges,
                reason: decision.reasoning
            },
            priority: 1,
            timestamp: Date.now()
        });
    }

    private async updateScannerAllocation(allocation: any) {
        const { scanners, focusArea } = allocation;

        // Send allocation update to scanner crew
        await this.messageRouter.sendMessage({
            type: 'SCANNER_ALLOCATION',
            source: 'decision_engine',
            target: 'repository_scanner_manager',
            payload: {
                requestedScanners: scanners,
                mode: this.determineScanMode(scanners, focusArea),
                focusAreas: [focusArea],
                priority: 'high'
            },
            priority: 2,
            timestamp: Date.now()
        });

        // Cache allocation
        this.scannerAllocationCache.set(focusArea, scanners);
    }

    private determineScanMode(scanners: number, focusArea: string): string {
        if (scanners === 1) return 'minimal';
        if (scanners <= 3) return 'targeted';
        if (scanners <= 5) return 'comprehensive';
        return 'deep_dive';
    }

    private async getCurrentSystemState(): Promise<SystemState> {
        const [users, tasks, issues] = await Promise.all([
            this.getActiveUsers(),
            this.getTaskMetrics(),
            this.getCriticalIssues()
        ]);

        return {
            activeUsers: users.length,
            tasksInProgress: tasks.inProgress,
            completionRate: tasks.completionRate,
            blockedTasks: tasks.blocked,
            criticalIssues: issues
        };
    }

    private async getActiveUsers() {
        const snapshot = await this.db
            .collection('users')
            .where('status', '==', 'active')
            .where('lastActivity', '>', Date.now() - 600000) // Active in last 10 min
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    private async getTaskMetrics() {
        const tasks = await this.db.collection('tasks').get();
        const taskData = tasks.docs.map(doc => doc.data());

        const inProgress = taskData.filter(t => t.status === 'in_progress').length;
        const completed = taskData.filter(t => t.status === 'completed').length;
        const blocked = taskData
            .filter(t => t.status === 'blocked')
            .map(t => t.id);

        return {
            inProgress,
            completionRate: (completed / taskData.length) * 100,
            blocked
        };
    }

    private async getCriticalIssues() {
        const issues = await this.db
            .collection('issues')
            .where('severity', '==', 'critical')
            .where('status', '!=', 'resolved')
            .get();

        return issues.docs.map(doc => doc.id);
    }

    private startContinuousMonitoring() {
        this.continuousMonitoringInterval = setInterval(async () => {
            await this.performContinuousAnalysis();
        }, 10000); // Every 10 seconds
    }

    private async performContinuousAnalysis() {
        const state = await this.getCurrentSystemState();

        // Check for issues requiring intervention
        if (state.blockedTasks.length > 2) {
            await this.handleMultipleBlockages(state.blockedTasks);
        }

        if (state.completionRate < 30 && state.tasksInProgress > 5) {
            await this.suggestResourceReallocation();
        }

        if (state.criticalIssues.length > 0) {
            await this.escalateCriticalIssues(state.criticalIssues);
        }
    }

    private async handleMultipleBlockages(blockedTasks: string[]) {
        await this.messageRouter.sendMessage({
            type: 'BLOCKAGE_ALERT',
            source: 'decision_engine',
            target: 'progress_coordinator',
            payload: {
                blockedTasks,
                suggestion: 'initiate_team_sync'
            },
            priority: 1,
            timestamp: Date.now()
        });
    }

    private async suggestResourceReallocation() {
        const suggestion = await this.generateReallocationStrategy();

        await this.messageRouter.sendMessage({
            type: 'REALLOCATION_SUGGESTION',
            source: 'decision_engine',
            target: 'roadmap_orchestrator',
            payload: suggestion,
            priority: 2,
            timestamp: Date.now()
        });
    }

    private async generateReallocationStrategy() {
        const prompt = `
    Generate resource reallocation strategy:
    - Low completion rate detected
    - Multiple tasks in progress
    - Suggest task prioritization and resource redistribution
    `;

        const response = await this.openai.chat.completions.create({
            model: 'o4-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4,
            max_completion_tokens: 500
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response content received from OpenAI');
        }
        return content;
    }

    private async escalateCriticalIssues(issues: string[]) {
        for (const issue of issues) {
            await this.messageRouter.sendMessage({
                type: 'CRITICAL_ISSUE',
                source: 'decision_engine',
                target: 'all_agents',
                payload: {
                    issueId: issue,
                    action: 'immediate_attention_required'
                },
                priority: 1,
                timestamp: Date.now()
            });
        }
    }

    private async notifyAffectedUsers(users: string[], decision: any) {
        for (const userId of users) {
            await this.db.collection('notifications').add({
                userId,
                type: 'decision_update',
                message: decision.decision,
                priority: decision.priority,
                timestamp: Timestamp.now()
            });
        }
    }

    private async initiateCollaboration(details: any) {
        await this.messageRouter.sendMessage({
            type: 'COLLABORATION_REQUEST',
            source: 'decision_engine',
            target: 'collaboration_manager',
            payload: details,
            priority: 2,
            timestamp: Date.now()
        });
    }

    private async sendNotification(target: string, details: any) {
        await this.db.collection('notifications').add({
            target,
            ...details,
            timestamp: Timestamp.now()
        });
    }

    private async allocateResources(target: string, details: any) {
        await this.db.collection('resource_allocations').add({
            target,
            ...details,
            timestamp: Timestamp.now()
        });
    }

    private async updateComponent(target: string, details: any) {
        await this.messageRouter.sendMessage({
            type: 'COMPONENT_UPDATE',
            source: 'decision_engine',
            target,
            payload: details,
            priority: 3,
            timestamp: Date.now()
        });
    }

    private async notifyAgent(agent: string, decision: any) {
        await this.messageRouter.sendMessage({
            type: 'DECISION_NOTIFICATION',
            source: 'decision_engine',
            target: agent,
            payload: {
                decision: decision.decision,
                actions: decision.actions.filter((a: any) => a.target === agent),
                priority: decision.priority
            },
            priority: 2,
            timestamp: Date.now()
        });
    }

    private updateMonitoringContext(context: any) {
        // Store context for future decisions
        this.db.collection('monitoring_context').add({
            ...context,
            timestamp: Timestamp.now()
        });
    }

    private async handleProgressUpdate(message: AgentMessage) {
        // Process progress updates and adjust strategy
        const { progress, userId, taskId } = message.payload;

        if (progress < 30 && message.payload.timeElapsed > 3600000) {
            // Task taking too long
            await this.suggestAssistance(userId, taskId);
        }
    }

    private async handleScannerAllocation(message: AgentMessage) {
        const { requestType, complexity, area } = message.payload;

        const scannerCount = this.calculateOptimalScanners(complexity);

        await this.updateScannerAllocation({
            scanners: scannerCount,
            focusArea: area
        });
    }

    private calculateOptimalScanners(complexity: string): number {
        const complexityMap: Record<string, number> = {
            low: 1,
            medium: 3,
            high: 5,
            critical: 8
        };
        return complexityMap[complexity] || 2;
    }

    private async suggestAssistance(userId: string, taskId: string) {
        await this.messageRouter.sendMessage({
            type: 'ASSISTANCE_SUGGESTION',
            source: 'decision_engine',
            target: 'user_communication_hub',
            payload: {
                userId,
                taskId,
                message: 'User may need assistance with this task'
            },
            priority: 2,
            timestamp: Date.now()
        });
    }

    cleanup() {
        if (this.continuousMonitoringInterval) {
            clearInterval(this.continuousMonitoringInterval);
        }
    }
}
