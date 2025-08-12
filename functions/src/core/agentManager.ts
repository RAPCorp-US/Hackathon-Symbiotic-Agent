// functions/src/core/agentManager.ts
import { Firestore } from '@google-cloud/firestore';
import { CodeExtractor } from '../agents/codeExtractor';
import { DecisionEngine } from '../agents/decisionEngine';
import { EditCoordinator } from '../agents/editCoordinator';
import { ProgressCoordinator } from '../agents/progressCoordinator';
import { RepositoryScannerManager } from '../agents/repositoryScannerManager';
import { RoadmapOrchestrator } from '../agents/roadmapOrchestrator';
import { UserCompiler } from '../agents/userCompiler';
import { Logger } from '../utils/logger';
import { HealthMonitor } from './healthMonitor';
import { MessageRouter } from './messageRouter';
import { TokenManager } from './tokenManager';
import { UserCommunicationHub } from './userCommunicationHub';

export class AgentManager {
    private agents: Map<string, any> = new Map();
    private messageRouter: MessageRouter;
    private healthMonitor: HealthMonitor;
    private tokenManager: TokenManager;
    private logger: Logger;
    private initialized: boolean = false;

    constructor(private db: Firestore) {
        this.logger = new Logger('AgentManager');
        this.messageRouter = new MessageRouter(db, this.logger);
        this.healthMonitor = new HealthMonitor(db, this.logger);
        this.tokenManager = new TokenManager(db, this.logger);
    }

    async initialize() {
        if (this.initialized) {
            this.logger.info('🔄 AgentManager already initialized, skipping');
            return;
        }

        const initStartTime = new Date().toISOString();
        this.logger.info(`🚀 [${initStartTime}] STARTING AgentManager Initialization`);

        try {
            // Initialize core services first
            this.logger.info(`📡 [${initStartTime}] Initializing MessageRouter...`);
            await this.messageRouter.initialize();
            this.logger.info(`✅ [${initStartTime}] MessageRouter initialized`);

            this.logger.info(`🏥 [${initStartTime}] Initializing HealthMonitor...`);
            await this.healthMonitor.initialize();
            this.logger.info(`✅ [${initStartTime}] HealthMonitor initialized`);

            this.logger.info(`🎟️ [${initStartTime}] Initializing TokenManager...`);
            await this.tokenManager.initialize();
            this.logger.info(`✅ [${initStartTime}] TokenManager initialized`);

            // Initialize agents in order of dependencies
            this.logger.info(`🤖 [${initStartTime}] Starting agent initialization...`);
            await this.initializeAgents();
            this.logger.info(`✅ [${initStartTime}] All agents initialized`);

            // Start health monitoring
            this.logger.info(`🏥 [${initStartTime}] Starting health monitoring...`);
            this.healthMonitor.startMonitoring(this.agents);
            this.logger.info(`✅ [${initStartTime}] Health monitoring started`);

            // Start token tracking
            this.logger.info(`🎟️ [${initStartTime}] Starting token tracking...`);
            this.tokenManager.startTracking(this.agents);
            this.logger.info(`✅ [${initStartTime}] Token tracking started`);

            this.initialized = true;
            const endTime = new Date().toISOString();
            this.logger.info(`🎉 [${endTime}] AgentManager initialized successfully!`);
            this.logger.info(`📊 [${endTime}] Total agents initialized: ${this.agents.size}`);

            // Log all initialized agents
            for (const [id, agent] of this.agents) {
                this.logger.info(`🤖 [${endTime}] Agent: ${id} (${agent.constructor.name})`);
            }

        } catch (error) {
            const errorTime = new Date().toISOString();
            this.logger.error(`💥 [${errorTime}] Failed to initialize Agent Manager:`, error);
            throw error;
        }
    }

    private async initializeAgents() {
        // Layer 2: Roadmap Orchestrator
        const roadmapOrchestrator = new RoadmapOrchestrator(
            this.db,
            this.messageRouter,
            this.logger
        );
        this.agents.set('roadmap_orchestrator', roadmapOrchestrator);

        // Layer 3: Repository Scanner Manager
        const scannerManager = new RepositoryScannerManager(
            this.db,
            this.messageRouter,
            this.logger
        );
        this.agents.set('repository_scanner_manager', scannerManager);

        // Layer 5: Progress Coordinator (initialize before Layer 4)
        try {
            const progressCoordinator = new ProgressCoordinator(
                this.db,
                this.messageRouter,
                this.logger
            );
            this.agents.set('progress_coordinator', progressCoordinator);
            this.logger.info('ProgressCoordinator initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize ProgressCoordinator:', error);
            throw error;
        }

        // Layer 6: Decision Engine
        const decisionEngine = new DecisionEngine(
            this.db,
            this.messageRouter,
            this.logger
        );
        this.agents.set('decision_engine', decisionEngine);

        // Layer 4: User Compilers (dynamic creation)
        await this.initializeUserCompilers();

        // Layer 7: Code Extraction Team
        const codeExtractor = new CodeExtractor(
            this.db,
            this.messageRouter,
            this.logger
        );
        this.agents.set('code_extractor', codeExtractor);

        const editCoordinator = new EditCoordinator(
            this.db,
            this.messageRouter,
            this.logger
        );
        this.agents.set('edit_coordinator', editCoordinator);

        // Communication Hub
        const communicationHub = new UserCommunicationHub(
            this.db,
            this.messageRouter,
            decisionEngine,
            this.logger
        );
        this.agents.set('communication_hub', communicationHub);
    }

    private async initializeUserCompilers() {
        const users = await this.db.collection('users').get();

        for (const userDoc of users.docs) {
            const userId = userDoc.id;
            const compiler = new UserCompiler(
                userId,
                this.db,
                this.messageRouter,
                this.logger
            );
            this.agents.set(`user_compiler_${userId}`, compiler);
        }
    }

    async addUser(userId: string, userData: any) {
        // Add user to database
        await this.db.collection('users').doc(userId).set(userData);

        // Create user compiler
        const compiler = new UserCompiler(
            userId,
            this.db,
            this.messageRouter,
            this.logger
        );
        this.agents.set(`user_compiler_${userId}`, compiler);

        // Notify roadmap orchestrator
        await this.messageRouter.sendMessage({
            type: 'USER_REGISTERED',
            source: 'agent_manager',
            target: 'roadmap_orchestrator',
            payload: { user: { id: userId, ...userData } },
            priority: 1,
            timestamp: Date.now()
        });
    }

    async removeUser(userId: string) {
        // Notify roadmap orchestrator
        await this.messageRouter.sendMessage({
            type: 'USER_DEPARTED',
            source: 'agent_manager',
            target: 'roadmap_orchestrator',
            payload: { userId },
            priority: 1,
            timestamp: Date.now()
        });

        // Clean up user compiler
        const compiler = this.agents.get(`user_compiler_${userId}`);
        if (compiler && compiler.cleanup) {
            await compiler.cleanup();
        }
        this.agents.delete(`user_compiler_${userId}`);

        // Update user status
        await this.db.collection('users').doc(userId).update({
            status: 'inactive',
            departedAt: Date.now()
        });
    }

    getAgent(agentId: string): any {
        return this.agents.get(agentId);
    }

    async getStatus() {
        const status: any = {
            initialized: this.initialized,
            agents: {},
            health: await this.healthMonitor.getHealthReport(),
            tokens: await this.tokenManager.getTokenUsage()
        };

        for (const [id, agent] of this.agents) {
            status.agents[id] = {
                active: true,
                type: agent.constructor.name
            };

            if (agent.getStatus) {
                status.agents[id].details = await agent.getStatus();
            }
        }

        return status;
    }

    async shutdown() {
        this.logger.info('Shutting down Agent Manager');

        // Stop monitoring
        this.healthMonitor.stopMonitoring();
        this.tokenManager.stopTracking();

        // Cleanup all agents
        for (const [id, agent] of this.agents) {
            if (agent.cleanup) {
                await agent.cleanup();
            }
        }

        this.agents.clear();
        this.initialized = false;
    }
}
