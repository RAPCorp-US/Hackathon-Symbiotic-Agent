// functions/src/agents/roadmapOrchestrator.ts
import { FieldValue, Firestore } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getApiKeys } from '../config/apiKeys';
import { MessageRouter } from '../core/messageRouter';
import { Roadmap, StrategicSummary, Task, User } from '../models/types';
import { Logger } from '../utils/logger';

export class RoadmapOrchestrator {
    private gemini: GoogleGenerativeAI;
    private model: any;
    private currentRoadmap: Roadmap | null = null;
    private updateInterval: NodeJS.Timeout | null = null;

    constructor(
        private db: Firestore,
        private messageRouter: MessageRouter,
        private logger: Logger
    ) {
        const apiKeys = getApiKeys();
        this.gemini = new GoogleGenerativeAI(apiKeys.gemini!);
        this.model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-pro' });
        this.initialize();
    }

    private initialize() {
        this.logger.info('Initializing Roadmap Orchestrator');
        this.startContinuousOrchestration();
        this.setupMessageHandlers();
    }

    private setupMessageHandlers() {
        // Listen for new user registrations
        this.messageRouter.on('USER_REGISTERED', async (message) => {
            await this.handleNewUser(message.payload.user);
        });

        // Listen for user departures
        this.messageRouter.on('USER_DEPARTED', async (message) => {
            await this.handleUserDeparture(message.payload.userId);
        });

        // Listen for strategic summaries from O4-Mini
        this.messageRouter.on('STRATEGIC_SUMMARY', async (message) => {
            await this.incorporateStrategicSummary(message.payload);
        });

        // Listen for roadmap update requests
        this.messageRouter.on('ROADMAP_UPDATE', async (message) => {
            await this.handleRoadmapUpdateRequest(message.payload);
        });
    }

    private startContinuousOrchestration() {
        // Continuous roadmap updates every 5 minutes
        this.updateInterval = setInterval(async () => {
            await this.updateRoadmap();
        }, 300000);

        // Initial roadmap creation
        this.createInitialRoadmap();
    }

    async createInitialRoadmap() {
        const users = await this.getAllUsers();
        const projectScope = await this.getProjectScope();

        const prompt = `
    Create a comprehensive hackathon roadmap:
    
    Project: ${projectScope.name}
    Description: ${projectScope.description}
    Duration: ${projectScope.duration} hours
    
    Current Team (${users.length} members):
    ${users.map(u => `- ${u.name}: ${u.skills.join(', ')} | Available: ${u.availableHours}h`).join('\n')}
    
    Generate a dynamic roadmap that:
    1. Assigns tasks based on user skills
    2. Creates parallel work streams
    3. Identifies dependencies
    4. Sets realistic milestones
    5. Plans for integration points
    6. Includes buffer time for issues
    
    Return as JSON with structure:
    {
      "phases": [
        {
          "name": "Phase name",
          "duration": hours,
          "tasks": [
            {
              "id": "unique_id",
              "name": "Task name",
              "description": "Details",
              "assignedTo": ["userId"],
              "skills": ["required skills"],
              "dependencies": ["task_ids"],
              "estimatedHours": number,
              "priority": "critical|high|medium|low"
            }
          ]
        }
      ],
      "milestones": [
        {
          "name": "Milestone",
          "targetTime": "T+hours",
          "criteria": ["completion criteria"]
        }
      ],
      "integrationPoints": [
        {
          "time": "T+hours",
          "teams": ["userIds"],
          "purpose": "Integration purpose"
        }
      ],
      "riskMitigation": {
        "identifiedRisks": ["risk descriptions"],
        "bufferTime": hours,
        "contingencyPlans": ["plan descriptions"]
      }
    }`;

        const result = await this.model.generateContent(prompt);
        const roadmap = JSON.parse(result.response.text());

        this.currentRoadmap = {
            ...roadmap,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            version: 1
        };

        await this.saveRoadmap();
        await this.distributeTasksToUsers();
        await this.notifyAllAgents();
    }

    async handleNewUser(user: User) {
        this.logger.info(`New user registered: ${user.name}`);

        if (!this.currentRoadmap) {
            await this.createInitialRoadmap();
            return;
        }

        // Analyze how to integrate new user
        const prompt = `
    A new user has joined the hackathon. Integrate them into the existing roadmap:
    
    New User:
    - Name: ${user.name}
    - Skills: ${user.skills.join(', ')}
    - Available Hours: ${user.availableHours}
    
    Current Roadmap:
    ${JSON.stringify(this.currentRoadmap, null, 2)}
    
    Determine:
    1. Which tasks to reassign to the new user
    2. New tasks that can be added with their skills
    3. How this affects timelines
    4. Updated task distribution
    
    Return updated task assignments and any roadmap modifications as JSON.`;

        const result = await this.model.generateContent(prompt);
        const updates = JSON.parse(result.response.text());

        await this.applyRoadmapUpdates(updates);
        await this.notifyAffectedUsers(updates.affectedUsers);
    }

    async handleUserDeparture(userId: string) {
        this.logger.info(`User departed: ${userId}`);

        if (!this.currentRoadmap) return;

        // Find tasks assigned to departing user
        const affectedTasks = this.findUserTasks(userId);
        const remainingUsers = await this.getActiveUsers();

        const prompt = `
    A user has left the hackathon. Redistribute their tasks:
    
    Departing User's Tasks:
    ${JSON.stringify(affectedTasks, null, 2)}
    
    Remaining Team:
    ${remainingUsers.map(u => `- ${u.name}: ${u.skills.join(', ')} | Current load: ${u.taskCount} tasks`).join('\n')}
    
    Redistribute tasks optimally considering:
    1. Skill matching
    2. Current workload
    3. Task dependencies
    4. Critical path impact
    
    Return redistribution plan as JSON.`;

        const result = await this.model.generateContent(prompt);
        const redistribution = JSON.parse(result.response.text());

        await this.redistributeTasks(redistribution);
    }

    async incorporateStrategicSummary(summary: StrategicSummary) {
        this.logger.info('Incorporating strategic summary from O4-Mini');

        const prompt = `
    Strategic insights from O4-Mini decision engine:
    
    ${JSON.stringify(summary, null, 2)}
    
    Current Roadmap Version: ${this.currentRoadmap?.version}
    
    Based on these insights, determine if roadmap adjustments are needed:
    1. Task prioritization changes
    2. Resource reallocation
    3. Timeline adjustments
    4. New risk mitigations
    
    Return recommendations as JSON.`;

        const result = await this.model.generateContent(prompt);
        const recommendations = JSON.parse(result.response.text());

        if (recommendations.adjustmentsNeeded) {
            await this.applyStrategicAdjustments(recommendations);
        }
    }

    async updateRoadmap() {
        const currentProgress = await this.getCurrentProgress();
        const activeUsers = await this.getActiveUsers();
        const issues = await this.getActiveIssues();

        const prompt = `
    Perform continuous roadmap update:
    
    Current Progress:
    ${JSON.stringify(currentProgress, null, 2)}
    
    Active Users: ${activeUsers.length}
    Active Issues: ${issues.length}
    Time Elapsed: ${this.getElapsedTime()} hours
    
    Analyze and update:
    1. Are we on track for milestones?
    2. Do task assignments need adjustment?
    3. Are there bottlenecks forming?
    4. Should priorities be shifted?
    
    Return updated roadmap sections as JSON.`;

        const result = await this.model.generateContent(prompt);
        const updates = JSON.parse(result.response.text());

        if (updates.changesRequired) {
            await this.applyRoadmapUpdates(updates);
            this.currentRoadmap!.version++;
            this.currentRoadmap!.lastUpdated = Date.now();
            await this.saveRoadmap();
        }
    }

    async distributeTasksToUsers() {
        if (!this.currentRoadmap) return;

        for (const phase of this.currentRoadmap.phases) {
            for (const task of phase.tasks) {
                for (const userId of task.assignedTo) {
                    await this.messageRouter.sendMessage({
                        type: 'TASK_ASSIGNMENT',
                        source: 'roadmap_orchestrator',
                        target: `user_compiler_${userId}`,
                        payload: {
                            task,
                            phase: phase.name,
                            dependencies: task.dependencies,
                            deadline: this.calculateDeadline(phase, task)
                        },
                        priority: this.mapPriorityToNumber(task.priority),
                        timestamp: Date.now()
                    });
                }
            }
        }
    }

    private async notifyAllAgents() {
        // Notify Progress Coordinator
        await this.messageRouter.sendMessage({
            type: 'ROADMAP_CREATED',
            source: 'roadmap_orchestrator',
            target: 'progress_coordinator',
            payload: this.currentRoadmap,
            priority: 1,
            timestamp: Date.now()
        });

        // Notify Decision Engine
        await this.messageRouter.sendMessage({
            type: 'ROADMAP_CREATED',
            source: 'roadmap_orchestrator',
            target: 'decision_engine',
            payload: {
                summary: this.generateRoadmapSummary(),
                criticalPath: this.identifyCriticalPath()
            },
            priority: 2,
            timestamp: Date.now()
        });
    }

    private async getAllUsers(): Promise<User[]> {
        const snapshot = await this.db.collection('users').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
    }

    private async getActiveUsers(): Promise<any[]> {
        const snapshot = await this.db
            .collection('users')
            .where('status', '==', 'active')
            .get();

        const users = [];
        for (const doc of snapshot.docs) {
            const userData = doc.data();
            const taskCount = await this.getUserTaskCount(doc.id);
            users.push({
                ...userData,
                id: doc.id,
                taskCount
            });
        }
        return users;
    }

    private async getUserTaskCount(userId: string): Promise<number> {
        if (!this.currentRoadmap) return 0;

        let count = 0;
        for (const phase of this.currentRoadmap.phases) {
            for (const task of phase.tasks) {
                if (task.assignedTo.includes(userId) && task.status !== 'completed') {
                    count++;
                }
            }
        }
        return count;
    }

    private findUserTasks(userId: string): Task[] {
        if (!this.currentRoadmap) return [];

        const tasks: Task[] = [];
        for (const phase of this.currentRoadmap.phases) {
            for (const task of phase.tasks) {
                if (task.assignedTo.includes(userId)) {
                    tasks.push(task);
                }
            }
        }
        return tasks;
    }

    private async getProjectScope() {
        const doc = await this.db.collection('hackathon').doc('current').get();
        return doc.data() || { name: 'Hackathon Project', description: '', duration: 8 };
    }

    private async getCurrentProgress() {
        const tasks = await this.db.collection('tasks').get();
        const taskData = tasks.docs.map(doc => doc.data());

        return {
            totalTasks: taskData.length,
            completed: taskData.filter(t => t.status === 'completed').length,
            inProgress: taskData.filter(t => t.status === 'in_progress').length,
            blocked: taskData.filter(t => t.status === 'blocked').length,
            notStarted: taskData.filter(t => t.status === 'not_started').length
        };
    }

    private async getActiveIssues() {
        const issues = await this.db
            .collection('issues')
            .where('status', '!=', 'resolved')
            .get();
        return issues.docs.map(doc => doc.data());
    }

    private getElapsedTime(): number {
        if (!this.currentRoadmap) return 0;
        return (Date.now() - this.currentRoadmap.createdAt) / 3600000; // hours
    }

    private async saveRoadmap() {
        if (!this.currentRoadmap) return;

        await this.db.collection('roadmaps').doc('current').set(this.currentRoadmap);
    }

    private async applyRoadmapUpdates(updates: any) {
        // Apply updates to current roadmap
        if (this.currentRoadmap) {
            Object.assign(this.currentRoadmap, updates);
            await this.saveRoadmap();

            // Notify affected components
            await this.distributeTasksToUsers();
        }
    }

    private async redistributeTasks(redistribution: any) {
        for (const reassignment of redistribution.reassignments) {
            const { taskId, fromUser, toUser } = reassignment;

            // Update task assignment
            await this.updateTaskAssignment(taskId, fromUser, toUser);

            // Notify new assignee
            await this.messageRouter.sendMessage({
                type: 'TASK_REASSIGNED',
                source: 'roadmap_orchestrator',
                target: `user_compiler_${toUser}`,
                payload: { taskId, reason: 'User departure' },
                priority: 1,
                timestamp: Date.now()
            });
        }
    }

    private async updateTaskAssignment(taskId: string, fromUser: string, toUser: string) {
        // Update in roadmap
        if (this.currentRoadmap) {
            for (const phase of this.currentRoadmap.phases) {
                for (const task of phase.tasks) {
                    if (task.id === taskId) {
                        task.assignedTo = task.assignedTo.filter(u => u !== fromUser);
                        task.assignedTo.push(toUser);
                    }
                }
            }
        }

        // Update in database
        await this.db.collection('tasks').doc(taskId).update({
            assignedTo: FieldValue.arrayRemove(fromUser),
            assignedToAdd: FieldValue.arrayUnion(toUser)
        });
    }

    private async notifyAffectedUsers(userIds: string[]) {
        for (const userId of userIds) {
            await this.messageRouter.sendMessage({
                type: 'ROADMAP_UPDATED',
                source: 'roadmap_orchestrator',
                target: `user_compiler_${userId}`,
                payload: { version: this.currentRoadmap?.version },
                priority: 2,
                timestamp: Date.now()
            });
        }
    }

    private generateRoadmapSummary() {
        if (!this.currentRoadmap) return null;

        return {
            totalPhases: this.currentRoadmap.phases.length,
            totalTasks: this.currentRoadmap.phases.reduce((sum, p) => sum + p.tasks.length, 0),
            milestones: this.currentRoadmap.milestones.length,
            estimatedCompletion: this.calculateEstimatedCompletion(),
            criticalTasks: this.identifyCriticalTasks()
        };
    }

    private identifyCriticalPath() {
        // Identify tasks on critical path
        const criticalTasks: string[] = [];
        if (this.currentRoadmap) {
            for (const phase of this.currentRoadmap.phases) {
                for (const task of phase.tasks) {
                    if (task.priority === 'critical') {
                        criticalTasks.push(task.id);
                    }
                }
            }
        }
        return criticalTasks;
    }

    private identifyCriticalTasks() {
        const critical: any[] = [];
        if (this.currentRoadmap) {
            for (const phase of this.currentRoadmap.phases) {
                critical.push(...phase.tasks.filter(t => t.priority === 'critical'));
            }
        }
        return critical;
    }

    private calculateEstimatedCompletion(): number {
        if (!this.currentRoadmap) return 0;

        let totalHours = 0;
        for (const phase of this.currentRoadmap.phases) {
            totalHours += phase.duration;
        }
        return Date.now() + (totalHours * 3600000);
    }

    private calculateDeadline(phase: any, task: any): number {
        return Date.now() + (phase.duration * 3600000);
    }

    private mapPriorityToNumber(priority: string): number {
        const map: Record<string, number> = {
            critical: 1,
            high: 2,
            medium: 3,
            low: 4
        };
        return map[priority] || 3;
    }

    private async handleRoadmapUpdateRequest(payload: any) {
        const { decision, userFeedback, suggestedChanges } = payload;

        const prompt = `
    Roadmap update requested by Decision Engine:
    
    Decision: ${JSON.stringify(decision)}
    User Feedback: ${JSON.stringify(userFeedback)}
    Suggested Changes: ${JSON.stringify(suggestedChanges)}
    
    Current Roadmap State:
    - Version: ${this.currentRoadmap?.version}
    - Active Tasks: ${this.currentRoadmap?.phases.reduce((sum, p) => sum + p.tasks.length, 0)}
    
    Evaluate and apply appropriate changes.
    Return updated roadmap sections.`;

        const result = await this.model.generateContent(prompt);
        const updates = JSON.parse(result.response.text());

        await this.applyRoadmapUpdates(updates);
    }

    private async applyStrategicAdjustments(recommendations: any) {
        this.logger.info('Applying strategic adjustments from O4-Mini');

        if (recommendations.priorityChanges) {
            await this.updateTaskPriorities(recommendations.priorityChanges);
        }

        if (recommendations.resourceReallocation) {
            await this.reallocateResources(recommendations.resourceReallocation);
        }

        if (recommendations.timelineAdjustments) {
            await this.adjustTimelines(recommendations.timelineAdjustments);
        }

        await this.saveRoadmap();
        await this.notifyAllAgents();
    }

    private async updateTaskPriorities(changes: any[]) {
        for (const change of changes) {
            const { taskId, newPriority } = change;

            if (this.currentRoadmap) {
                for (const phase of this.currentRoadmap.phases) {
                    const task = phase.tasks.find(t => t.id === taskId);
                    if (task) {
                        task.priority = newPriority;
                    }
                }
            }
        }
    }

    private async reallocateResources(reallocation: any) {
        for (const item of reallocation) {
            await this.updateTaskAssignment(item.taskId, item.fromUser, item.toUser);
        }
    }

    private async adjustTimelines(adjustments: any[]) {
        for (const adjustment of adjustments) {
            const { phaseId, newDuration } = adjustment;

            if (this.currentRoadmap) {
                const phase = this.currentRoadmap.phases.find(p => p.id === phaseId);
                if (phase) {
                    phase.duration = newDuration;
                }
            }
        }
    }

    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}
