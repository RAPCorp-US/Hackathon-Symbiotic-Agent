// functions/src/agents/progressCoordinator.ts
import { Anthropic } from '@anthropic-ai/sdk';
import { Firestore } from '@google-cloud/firestore';
import { getApiKeys } from '../config/apiKeys';
import { MessageRouter } from '../core/messageRouter';
import { Logger } from '../utils/logger';

export class ProgressCoordinator {
    private anthropic: Anthropic;
    private globalState: any = {};
    private userProgress: Map<string, any> = new Map();
    private updateInterval: NodeJS.Timeout | null = null;

    constructor(
        private db: Firestore,
        private messageRouter: MessageRouter,
        private logger: Logger
    ) {
        this.logger.info('Initializing ProgressCoordinator...');

        try {
            this.logger.info('Getting API keys...');
            const apiKeys = getApiKeys();
            this.logger.info('Retrieved API keys for ProgressCoordinator:', {
                hasClaude: !!apiKeys.claude,
                claudeLength: apiKeys.claude ? apiKeys.claude.length : 0
            });

            if (!apiKeys.claude) {
                this.logger.error('Claude API key not found');
                throw new Error('Claude API key not configured');
            }

            this.logger.info('Creating Anthropic client...');
            this.anthropic = new Anthropic({
                apiKey: apiKeys.claude,
            });

            this.logger.info('Claude client created successfully, checking client properties...');
            this.logger.info('Anthropic client type:', typeof this.anthropic);
            this.logger.info('Anthropic client keys:', Object.keys(this.anthropic));

            this.logger.info('Starting initialization...');
        } catch (error) {
            this.logger.error('Failed to initialize Claude client:', error);
            throw error;
        }

        // Initialize asynchronously - this will be handled by the agent manager
        this.initialize().catch(error => {
            this.logger.error('Failed to initialize ProgressCoordinator:', error);
        });
    }

    private async initialize() {
        this.logger.info('Initializing Progress Coordinator');

        // Load initial state
        await this.loadGlobalState();

        // Setup message handlers
        this.setupMessageHandlers();

        // Start continuous coordination
        this.startContinuousCoordination();
    }

    private setupMessageHandlers() {
        // Listen for user progress updates
        this.messageRouter.on('USER_PROGRESS', async (message) => {
            await this.handleUserProgress(message.payload);
        });

        // Listen for repository analysis
        this.messageRouter.on('REPOSITORY_ANALYSIS', async (message) => {
            await this.handleRepositoryAnalysis(message.payload);
        });

        // Listen for roadmap creation
        this.messageRouter.on('ROADMAP_CREATED', async (message) => {
            await this.handleRoadmapCreated(message.payload);
        });
    }

    private async loadGlobalState() {
        const stateDoc = await this.db.collection('global_state').doc('current').get();
        this.globalState = stateDoc.data() || {};
    }

    private startContinuousCoordination() {
        this.updateInterval = setInterval(async () => {
            await this.performGlobalCoordination();
        }, 30000); // Every 30 seconds
    }

    private async handleUserProgress(payload: any) {
        const { userId, insights, impact } = payload;

        // Update user progress map
        this.userProgress.set(userId, {
            insights,
            impact,
            lastUpdate: Date.now()
        });

        // Check for cross-user dependencies
        await this.checkDependencies(userId, insights);

        // Update global progress
        await this.updateGlobalProgress();
    }

    private async handleRepositoryAnalysis(payload: any) {
        const { findings, metrics, recommendations } = payload;

        // Update global state with repository health
        this.globalState.repositoryHealth = {
            findings,
            metrics,
            lastAnalysis: Date.now()
        };

        // Identify conflicts or issues
        const conflicts = await this.identifyConflicts(findings);

        if (conflicts.length > 0) {
            await this.escalateConflicts(conflicts);
        }

        // Update progress visualization
        await this.updateProgressMap();
    }

    private async performGlobalCoordination() {
        const prompt = `
    Perform global progress coordination:
    
    Global State:
    ${JSON.stringify(this.globalState, null, 2)}
    
    User Progress (${this.userProgress.size} users):
    ${JSON.stringify(Array.from(this.userProgress.entries()), null, 2)}
    
    Analyze:
    1. Overall project progress
    2. Bottlenecks or blockers
    3. Collaboration opportunities
    4. Risk areas
    5. Resource allocation efficiency
    
    Provide:
    1. Progress assessment
    2. Critical issues
    3. Recommended interventions
    4. Collaboration suggestions
    
    Return as JSON with structure:
    {
      "overallProgress": percentage,
      "status": "on_track|at_risk|critical",
      "bottlenecks": [],
      "collaborationOpportunities": [],
      "criticalIssues": [],
      "recommendations": []
    }`;

        let coordination;

        try {
            this.logger.info('Making Claude API call for coordination analysis');
            this.logger.info('Pre-call validation - Anthropic client state:', {
                anthropicExists: !!this.anthropic,
                anthropicType: typeof this.anthropic,
                anthropicKeys: this.anthropic ? Object.keys(this.anthropic) : 'undefined',
                anthropicConstructor: this.anthropic ? this.anthropic.constructor.name : 'undefined'
            });

            if (!this.anthropic) {
                this.logger.error('Anthropic client not initialized - this.anthropic is undefined');
                this.logger.error('Attempting to reinitialize Anthropic client...');

                try {
                    const apiKeys = getApiKeys();
                    if (apiKeys.claude) {
                        this.anthropic = new Anthropic({
                            apiKey: apiKeys.claude,
                        });
                        this.logger.info('Successfully reinitialized Anthropic client');
                    } else {
                        throw new Error('Claude API key not available for reinitialization');
                    }
                } catch (reinitError) {
                    this.logger.error('Failed to reinitialize Anthropic client:', reinitError);
                    throw new Error('Anthropic client not initialized and reinitialization failed');
                }
            }

            this.logger.info('Anthropic client validation passed, making API call');

            const response = await (this.anthropic as any).messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1500,
                messages: [{ role: 'user', content: prompt }]
            });

            const content = response.content[0];
            if (content?.type === 'text') {
                try {
                    coordination = JSON.parse(content.text);
                } catch (parseError) {
                    this.logger.error('Failed to parse Claude response as JSON', parseError);
                    throw new Error('Invalid JSON response from Claude');
                }
            } else {
                throw new Error('Unexpected response content type from Claude');
            }
        } catch (error) {
            this.logger.error('Claude API call failed', error);
            throw error;
        }

        // Communicate with O4-Mini
        await this.communicateWithDecisionEngine(coordination);

        // Update global state
        this.globalState.coordination = coordination;
        await this.saveGlobalState();
    }

    private async communicateWithDecisionEngine(coordination: any) {
        // Constant bidirectional communication with O4-Mini
        await this.messageRouter.sendMessage({
            type: 'COORDINATION_UPDATE',
            source: 'progress_coordinator',
            target: 'decision_engine',
            payload: {
                coordination,
                userProgress: Array.from(this.userProgress.entries()),
                globalState: this.globalState
            },
            priority: 2,
            timestamp: Date.now()
        });

        // Request strategic input if needed
        if (coordination.status === 'critical' || coordination.status === 'at_risk') {
            await this.requestStrategicGuidance(coordination);
        }
    }

    private async requestStrategicGuidance(coordination: any) {
        await this.messageRouter.sendMessage({
            type: 'STRATEGIC_GUIDANCE_REQUEST',
            source: 'progress_coordinator',
            target: 'decision_engine',
            payload: {
                reason: 'project_at_risk',
                coordination,
                urgency: 'high'
            },
            priority: 1,
            timestamp: Date.now()
        });
    }

    private async checkDependencies(userId: string, insights: any) {
        // Check if user's progress affects others
        const dependencies = await this.db
            .collection('task_dependencies')
            .where('dependsOn', 'array-contains', userId)
            .get();

        if (dependencies.size > 0) {
            const affected = dependencies.docs.map(doc => doc.data());

            for (const dep of affected) {
                if (insights.blockers && insights.blockers.length > 0) {
                    // Notify affected users
                    await this.notifyDependencyIssue(dep.userId, userId, insights.blockers);
                }
            }
        }
    }

    private async updateGlobalProgress() {
        const allTasks = await this.db.collection('tasks').get();
        const taskData = allTasks.docs.map(doc => doc.data());

        const completed = taskData.filter(t => t.status === 'completed').length;
        const total = taskData.length;

        this.globalState.progress = {
            percentage: (completed / total) * 100,
            completedTasks: completed,
            totalTasks: total,
            inProgress: taskData.filter(t => t.status === 'in_progress').length,
            blocked: taskData.filter(t => t.status === 'blocked').length
        };

        await this.saveGlobalState();
    }

    private async identifyConflicts(findings: any[]): Promise<any[]> {
        const conflicts = [];

        // Look for merge conflicts, overlapping work, etc.
        for (const finding of findings) {
            if (finding.type === 'conflict' || finding.severity === 'critical') {
                const affectedUsers = await this.findAffectedUsers(finding);
                conflicts.push({
                    ...finding,
                    affectedUsers
                });
            }
        }

        return conflicts;
    }

    private async findAffectedUsers(finding: any): Promise<string[]> {
        // Find users working on affected files
        const tasks = await this.db
            .collection('tasks')
            .where('files', 'array-contains-any', finding.files || [])
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

    private async escalateConflicts(conflicts: any[]) {
        await this.messageRouter.sendMessage({
            type: 'CONFLICTS_DETECTED',
            source: 'progress_coordinator',
            target: 'decision_engine',
            payload: {
                conflicts,
                severity: 'high'
            },
            priority: 1,
            timestamp: Date.now()
        });
    }

    private async updateProgressMap() {
        const progressMap = {
            timestamp: Date.now(),
            overall: this.globalState.progress,
            users: Array.from(this.userProgress.entries()).map(([userId, data]) => ({
                userId,
                progress: data.insights.progress || 0,
                status: data.insights.status || 'active',
                lastUpdate: data.lastUpdate
            })),
            repositoryHealth: this.globalState.repositoryHealth,
            milestones: await this.getMilestoneStatus()
        };

        // Store progress map
        await this.db.collection('progress_maps').add(progressMap);

        // Send to dashboard
        await this.messageRouter.sendMessage({
            type: 'PROGRESS_MAP_UPDATE',
            source: 'progress_coordinator',
            target: 'dashboard',
            payload: progressMap,
            priority: 3,
            timestamp: Date.now()
        });
    }

    private async getMilestoneStatus() {
        const roadmap = await this.db.collection('roadmaps').doc('current').get();
        const milestones = roadmap.data()?.milestones || [];

        const statuses = [];
        for (const milestone of milestones) {
            const completed = await this.checkMilestoneCompletion(milestone);
            statuses.push({
                name: milestone.name,
                targetTime: milestone.targetTime,
                completed,
                status: completed ? 'completed' :
                    Date.now() > milestone.targetTime ? 'overdue' : 'pending'
            });
        }

        return statuses;
    }

    private async checkMilestoneCompletion(milestone: any): Promise<boolean> {
        // Check if all criteria are met
        for (const criterion of milestone.criteria) {
            // Implementation depends on criterion type
            if (!await this.checkCriterion(criterion)) {
                return false;
            }
        }
        return true;
    }

    private async checkCriterion(criterion: string): Promise<boolean> {
        // Simple implementation - can be expanded
        return Math.random() > 0.3; // Placeholder
    }

    private async notifyDependencyIssue(affectedUser: string, blockingUser: string, blockers: any[]) {
        await this.db.collection('notifications').add({
            userId: affectedUser,
            type: 'dependency_blocked',
            message: `Task dependency blocked by ${blockingUser}`,
            blockers,
            timestamp: Date.now()
        });
    }

    private async saveGlobalState() {
        await this.db.collection('global_state').doc('current').set(this.globalState);
    }

    private async handleRoadmapCreated(roadmap: any) {
        this.globalState.roadmap = {
            version: roadmap.version,
            phases: roadmap.phases.length,
            totalTasks: roadmap.phases.reduce((sum: number, p: any) => sum + p.tasks.length, 0),
            milestones: roadmap.milestones
        };

        await this.saveGlobalState();
    }

    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}
