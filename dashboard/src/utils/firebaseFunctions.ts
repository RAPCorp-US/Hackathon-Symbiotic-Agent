// dashboard/src/utils/firebaseFunctions.ts
// Firebase Callable Functions client using proper Firebase SDK

import { getApps, initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Initialize Firebase app if not already initialized
const firebaseConfig = {
    projectId: 'hackathon-agent-ce35f'
};

let app;
if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApps()[0];
}

const functions = getFunctions(app, 'us-central1');

// Explicitly ensure we're NOT using emulator
// Clear any emulator settings that might be cached
console.log('🔧 Firebase Functions Configuration:', {
    app: app.name,
    projectId: app.options.projectId,
    functionsRegion: 'us-central1',
    expectedURL: 'https://us-central1-hackathon-agent-ce35f.cloudfunctions.net'
});

// Helper function to call Firebase Callable Functions using the proper SDK
async function callCallableFunction(functionName: string, data: any = {}) {
    const timestamp = new Date().toISOString();

    console.log(`🚀 [${timestamp}] STARTING CALLABLE FUNCTION:`, {
        function: functionName,
        payload: JSON.stringify(data, null, 2),
        payloadSize: JSON.stringify(data).length + ' bytes'
    });

    try {
        const startTime = performance.now();

        console.log(`🔧 [${timestamp}] Creating callable function for:`, functionName);
        const callableFunction = httpsCallable(functions, functionName);
        console.log(`🔧 [${timestamp}] Callable function created, calling with data:`, data);

        const result = await callableFunction(data);

        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        console.log(`✅ [${timestamp}] CALLABLE FUNCTION SUCCESS:`, {
            function: functionName,
            duration: duration + 'ms',
            resultType: typeof result.data,
            resultKeys: result.data && typeof result.data === 'object' ? Object.keys(result.data) : 'N/A',
            resultSize: JSON.stringify(result.data).length + ' bytes'
        });

        return result.data;

    } catch (error) {
        console.error(`💥 [${timestamp}] CALLABLE FUNCTION EXCEPTION:`, {
            function: functionName,
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : 'No stack',
            errorCode: (error as any)?.code,
            errorDetails: (error as any)?.details
        });
        throw error;
    }
}

// Wrapper functions for easier use
export const firebaseFunctions = {
    // Chat functions
    async getProject(userId: string) {
        console.log('🎯 FRONTEND: Calling getProject with userId:', userId);
        try {
            const result = await callCallableFunction('getProject', { userId });
            console.log('🎯 FRONTEND: getProject result:', result);
            return result;
        } catch (error) {
            console.error('❌ FRONTEND: getProject error:', error);
            throw error;
        }
    },

    async getChatHistory(userId: string, projectId?: string, limit = 50, offset = 0) {
        console.log('🎯 FRONTEND: Calling getChatHistory with:', { userId, projectId, limit, offset });
        return await callCallableFunction('getChatHistory', { userId, projectId, limit, offset });
    },

    async createProject(userId: string, projectData: any, githubRepo?: string) {
        console.log('🎯 FRONTEND: Calling createProject with:', { userId, projectData, githubRepo });
        return await callCallableFunction('createProject', { userId, projectData, githubRepo });
    },

    async sendMessage(userId: string, message: string, messageContext?: any) {
        console.log('🎯 FRONTEND: Calling sendMessage with:', { userId, message, messageContext });
        return await callCallableFunction('sendMessage', { userId, message, messageContext });
    },

    async getRoadmap(projectId: string) {
        console.log('🎯 FRONTEND: Calling getRoadmap with projectId:', projectId);
        const result = await callCallableFunction('getRoadmap', { projectId }) as any;

        // Log the full result structure to debug
        console.log('🎯 FRONTEND: getRoadmap full result structure:', {
            resultKeys: Object.keys(result || {}),
            success: result?.success,
            hasPhases: !!result?.phases,
            hasTeamMembers: !!result?.teamMembers,
            hasLastUpdated: !!result?.lastUpdated,
            hasAiRecommendations: !!result?.aiRecommendations
        });

        console.log('🎯 FRONTEND: getRoadmap result received:', {
            success: result?.success,
            phases: result?.phases?.length || 0,
            teamMembers: result?.teamMembers?.length || 0,
            lastUpdated: result?.lastUpdated,
            aiRecommendations: result?.aiRecommendations?.length || 0
        });
        return result;
    },

    async getAllProjects() {
        console.log('🎯 FRONTEND: Calling getAllProjects via Firebase SDK');
        return await callCallableFunction('getAllProjects', {});
    },

    async getCommunicationMetrics(projectId?: string, timeframe?: string) {
        console.log('🎯 FRONTEND: Calling getCommunicationMetrics with:', { projectId, timeframe });
        return await callCallableFunction('getCommunicationMetrics', { projectId, timeframe });
    },

    // User functions
    async registerUser(userData: any) {
        console.log('🎯 FRONTEND: Calling registerUser with userData:', userData);
        return await callCallableFunction('registerUser', userData);
    },

    async loginUser(email: string, password: string) {
        console.log('🎯 FRONTEND: Calling loginUser with email:', email);
        return await callCallableFunction('loginUser', { email, password });
    },

    async getUsers() {
        console.log('🎯 FRONTEND: Calling getUsers');
        return await callCallableFunction('getUsers', {});
    },

    async getUser(userId: string) {
        console.log('🎯 FRONTEND: Calling getUser with userId:', userId);
        return await callCallableFunction('getUser', { userId });
    },

    async updateUser(userId: string, updates: any) {
        console.log('🎯 FRONTEND: Calling updateUser with:', { userId, updates });
        return await callCallableFunction('updateUser', { userId, updates });
    },

    // GitHub functions
    async verifyGitHub(githubToken: string) {
        console.log('🎯 FRONTEND: Calling verifyGitHub with token length:', githubToken?.length || 0);
        return await callCallableFunction('verifyGitHub', { githubToken });
    },

    async connectGitHub(userId: string, repoUrl: string, githubToken?: string) {
        console.log('🎯 FRONTEND: Calling connectGitHub with:', { userId, repoUrl, tokenLength: githubToken?.length || 0 });
        return await callCallableFunction('connectGitHub', { userId, repoUrl, githubToken });
    },

    async syncProjectWithGitHub(userId: string, projectId: string) {
        console.log('🎯 FRONTEND: Calling syncProjectWithGitHub with:', { userId, projectId });
        return await callCallableFunction('syncProjectWithGitHub', { userId, projectId });
    },

    // NEW AGENT CALLABLE FUNCTIONS - All using onCall architecture with intense logging
    async getAgentStatus() {
        console.log('🎯 FRONTEND: Calling getAgentStatus via Firebase SDK');
        try {
            const getAgentStatusFunction = httpsCallable(functions, 'getAgentStatus');
            const result = await getAgentStatusFunction({});
            const data = result.data as any;
            console.log('🎯 FRONTEND: getAgentStatus result received:', {
                success: data?.success,
                agentCount: data?.status?.agents ? Object.keys(data.status.agents).length : 0,
                message: data?.status?.message,
                timestamp: data?.timestamp
            });
            return data;
        } catch (error) {
            console.error('🚨 FRONTEND: getAgentStatus error:', error);
            throw error;
        }
    },

    async triggerRepositoryScanAgent(projectId: string, scanOptions: any = {}) {
        console.log('🎯 FRONTEND: Calling triggerRepositoryScan via Firebase SDK with:', { projectId, scanOptions });
        try {
            const triggerScanFunction = httpsCallable(functions, 'triggerRepositoryScan');
            const result = await triggerScanFunction({ projectId, scanOptions });
            const data = result.data as any;
            console.log('🎯 FRONTEND: triggerRepositoryScan result received:', {
                success: data?.success,
                message: data?.message,
                scanResults: data?.scanResults,
                timestamp: data?.timestamp
            });
            return data;
        } catch (error) {
            console.error('🚨 FRONTEND: triggerRepositoryScan error:', error);
            throw error;
        }
    },

    async requestDecisionSupport(decisionContext: any, options: any = {}) {
        console.log('🎯 FRONTEND: Calling requestDecisionSupport via Firebase SDK with:', { decisionContext, options });
        try {
            const decisionFunction = httpsCallable(functions, 'requestDecisionSupport');
            const result = await decisionFunction({ decisionContext, options });
            const data = result.data as any;
            console.log('🎯 FRONTEND: requestDecisionSupport result received:', {
                success: data?.success,
                message: data?.message,
                recommendation: data?.recommendation,
                timestamp: data?.timestamp
            });
            return data;
        } catch (error) {
            console.error('🚨 FRONTEND: requestDecisionSupport error:', error);
            throw error;
        }
    },

    async generateEditSuggestions(codeContext: any, editRequest: any = {}) {
        console.log('🎯 FRONTEND: Calling generateEditSuggestions via Firebase SDK with:', { codeContext, editRequest });
        try {
            const editFunction = httpsCallable(functions, 'generateEditSuggestions');
            const result = await editFunction({ codeContext, editRequest });
            const data = result.data as any;
            console.log('🎯 FRONTEND: generateEditSuggestions result received:', {
                success: data?.success,
                message: data?.message,
                suggestions: data?.suggestions,
                timestamp: data?.timestamp
            });
            return data;
        } catch (error) {
            console.error('🚨 FRONTEND: generateEditSuggestions error:', error);
            throw error;
        }
    },

    async trackProgress(projectId: string, progressData: any = {}) {
        console.log('🎯 FRONTEND: Calling trackProgress via Firebase SDK with:', { projectId, progressData });
        try {
            const progressFunction = httpsCallable(functions, 'trackProgress');
            const result = await progressFunction({ projectId, progressData });
            const data = result.data as any;
            console.log('🎯 FRONTEND: trackProgress result received:', {
                success: data?.success,
                message: data?.message,
                progressStatus: data?.progressStatus,
                timestamp: data?.timestamp
            });
            return data;
        } catch (error) {
            console.error('🚨 FRONTEND: trackProgress error:', error);
            throw error;
        }
    },

    async orchestrateRoadmap(projectId: string, requirements: any = {}) {
        console.log('🎯 FRONTEND: Calling orchestrateRoadmap via Firebase SDK with:', { projectId, requirements });
        try {
            const roadmapFunction = httpsCallable(functions, 'orchestrateRoadmap');
            const result = await roadmapFunction({ projectId, requirements });
            const data = result.data as any;
            console.log('🎯 FRONTEND: orchestrateRoadmap result received:', {
                success: data?.success,
                message: data?.message,
                roadmap: data?.roadmap,
                timestamp: data?.timestamp
            });
            return data;
        } catch (error) {
            console.error('🚨 FRONTEND: orchestrateRoadmap error:', error);
            throw error;
        }
    }
};
