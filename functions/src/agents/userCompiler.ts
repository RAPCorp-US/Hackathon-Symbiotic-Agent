// functions/src/agents/userCompiler.ts
import { Firestore } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getApiKeys } from '../config/apiKeys';
import { MessageRouter } from '../core/messageRouter';
import { Logger } from '../utils/logger';

export class UserCompiler {
    private gemini: GoogleGenerativeAI;
    private model: any;
    private userContext: any = {};
    private assignedTasks: any[] = [];

    constructor(
        private userId: string,
        private db: Firestore,
        private messageRouter: MessageRouter,
        private logger: Logger
    ) {
        const apiKeys = getApiKeys();
        this.gemini = new GoogleGenerativeAI(apiKeys.gemini!);
        this.model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
        this.initialize();
    }

    private async initialize() {
        this.logger.info(`Initializing User Compiler for ${this.userId}`);

        // Load user context
        await this.loadUserContext();

        // Setup message handlers
        this.setupMessageHandlers();

        // Start monitoring
        this.startUserMonitoring();
    }

    private setupMessageHandlers() {
        // Listen for task assignments
        this.messageRouter.on('TASK_ASSIGNMENT', async (message) => {
            if (message.target === `user_compiler_${this.userId}`) {
                await this.handleTaskAssignment(message.payload);
            }
        });

        // Listen for scan insights
        this.messageRouter.on('SCAN_INSIGHTS', async (message) => {
            await this.processRepositoryInsights(message.payload);
        });

        // Listen for roadmap updates
        this.messageRouter.on('ROADMAP_UPDATED', async (message) => {
            if (message.target === `user_compiler_${this.userId}`) {
                await this.handleRoadmapUpdate(message.payload);
            }
        });
    }

    private async loadUserContext() {
        const userDoc = await this.db.collection('users').doc(this.userId).get();
        this.userContext = userDoc.data();

        // Load assigned tasks
        const tasks = await this.db
            .collection('tasks')
            .where('assignedTo', 'array-contains', this.userId)
            .get();

        this.assignedTasks = tasks.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    private startUserMonitoring() {
        setInterval(async () => {
            await this.checkUserProgress();
            await this.generateUserInsights();
        }, 60000); // Every minute
    }

    private async handleTaskAssignment(payload: any) {
        const { task, phase, dependencies, deadline } = payload;

        this.assignedTasks.push(task);

        // Analyze task and provide guidance
        const guidance = await this.generateTaskGuidance(task, dependencies);

        // Store task assignment
        await this.db.collection('task_assignments').add({
            userId: this.userId,
            taskId: task.id,
            assignedAt: Date.now(),
            phase,
            deadline,
            guidance
        });

        // Notify user
        await this.notifyUser({
            type: 'task_assigned',
            task,
            guidance,
            deadline
        });
    }

    private async generateTaskGuidance(task: any, dependencies: string[]) {
        const prompt = `
    Generate personalized guidance for user task:
    
    User Skills: ${this.userContext.skills.join(', ')}
    User Experience: ${this.userContext.experience}
    
    Task: ${task.name}
    Description: ${task.description}
    Required Skills: ${task.skills.join(', ')}
    Dependencies: ${dependencies.join(', ')}
    
    Provide:
    1. Step-by-step approach
    2. Potential challenges
    3. Resources or documentation links
    4. Best practices specific to this task
    5. Integration points with dependencies
    
    Return as JSON.`;

        const result = await this.model.generateContent(prompt);
        return JSON.parse(result.response.text());
    }

    private async processRepositoryInsights(payload: any) {
        const { findings, summary } = payload;

        // Filter findings relevant to user's tasks
        const relevantFindings = findings.filter((f: any) =>
            this.isRelevantToUser(f)
        );

        if (relevantFindings.length > 0) {
            const contextualizedInsights = await this.contextualizeInsights(relevantFindings);

            // Send to Progress Coordinator
            await this.reportToProgressCoordinator({
                userId: this.userId,
                insights: contextualizedInsights,
                impact: this.assessImpact(relevantFindings)
            });

            // Notify user if critical
            const criticalFindings = relevantFindings.filter((f: any) => f.severity === 'critical');
            if (criticalFindings.length > 0) {
                await this.notifyUser({
                    type: 'critical_findings',
                    findings: criticalFindings
                });
            }
        }
    }

    private isRelevantToUser(finding: any): boolean {
        // Check if finding relates to user's tasks or files
        for (const task of this.assignedTasks) {
            if (finding.location && task.files) {
                for (const file of task.files) {
                    if (finding.location.includes(file)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private async contextualizeInsights(findings: any[]) {
        const prompt = `
    Contextualize these repository findings for the user:
    
    User Context:
    - Skills: ${this.userContext.skills.join(', ')}
    - Current Tasks: ${this.assignedTasks.map(t => t.name).join(', ')}
    
    Findings:
    ${JSON.stringify(findings, null, 2)}
    
    Provide:
    1. How each finding affects user's work
    2. Priority order for addressing issues
    3. Specific actions user should take
    4. Potential blockers or dependencies
    
    Return as JSON.`;

        const result = await this.model.generateContent(prompt);
        return JSON.parse(result.response.text());
    }

    private assessImpact(findings: any[]): string {
        const criticalCount = findings.filter(f => f.severity === 'critical').length;
        const highCount = findings.filter(f => f.severity === 'high').length;

        if (criticalCount > 0) return 'critical';
        if (highCount > 2) return 'high';
        if (highCount > 0) return 'medium';
        return 'low';
    }

    private async checkUserProgress() {
        const activeTasks = this.assignedTasks.filter(t => t.status === 'in_progress');

        for (const task of activeTasks) {
            const progress = await this.getTaskProgress(task.id);

            if (progress < 30 && task.startedAt && Date.now() - task.startedAt > 3600000) {
                // Task is taking too long
                await this.suggestAssistance(task);
            }

            // Update progress
            await this.db.collection('tasks').doc(task.id).update({
                progress,
                lastChecked: Date.now()
            });
        }
    }

    private async getTaskProgress(taskId: string): Promise<number> {
        // Check git commits, file changes, etc.
        const commits = await this.db
            .collection('commits')
            .where('taskId', '==', taskId)
            .where('userId', '==', this.userId)
            .get();

        // Simple progress calculation
        return Math.min(100, commits.size * 10);
    }

    private async generateUserInsights() {
        const prompt = `
    Generate insights for user progress:
    
    User: ${this.userContext.name}
    Active Tasks: ${this.assignedTasks.filter(t => t.status === 'in_progress').length}
    Completed Tasks: ${this.assignedTasks.filter(t => t.status === 'completed').length}
    
    Tasks:
    ${JSON.stringify(this.assignedTasks, null, 2)}
    
    Provide:
    1. Progress assessment
    2. Productivity insights
    3. Potential blockers
    4. Recommendations for improvement
    
    Return as JSON.`;

        const result = await this.model.generateContent(prompt);
        const insights = JSON.parse(result.response.text());

        // Report to Progress Coordinator
        await this.reportToProgressCoordinator({
            userId: this.userId,
            type: 'user_insights',
            insights,
            timestamp: Date.now()
        });
    }

    private async reportToProgressCoordinator(data: any) {
        await this.messageRouter.sendMessage({
            type: 'USER_PROGRESS',
            source: `user_compiler_${this.userId}`,
            target: 'progress_coordinator',
            payload: data,
            priority: 3,
            timestamp: Date.now()
        });
    }

    private async suggestAssistance(task: any) {
        await this.messageRouter.sendMessage({
            type: 'ASSISTANCE_NEEDED',
            source: `user_compiler_${this.userId}`,
            target: 'decision_engine',
            payload: {
                userId: this.userId,
                taskId: task.id,
                reason: 'slow_progress'
            },
            priority: 2,
            timestamp: Date.now()
        });
    }

    private async notifyUser(notification: any) {
        await this.db.collection('notifications').add({
            userId: this.userId,
            ...notification,
            timestamp: Date.now()
        });
    }

    private async handleRoadmapUpdate(payload: any) {
        // Reload tasks
        await this.loadUserContext();

        // Notify user of changes
        await this.notifyUser({
            type: 'roadmap_updated',
            version: payload.version
        });
    }
}
