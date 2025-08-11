// functions/src/api/chatCallableFunctions.ts
import { getFirestore } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';

// Callable function for getting communication metrics
export const getCommunicationMetrics = functions.https.onCall(async (data, context) => {
    console.log('getCommunicationMetrics called with data:', data);

    const { projectId, timeframe = '24h' } = data;

    try {
        const db = getFirestore();
        const now = Date.now();
        let timeThreshold = now - (24 * 60 * 60 * 1000); // Default 24h

        // Calculate time threshold based on timeframe
        switch (timeframe) {
            case '1h':
                timeThreshold = now - (60 * 60 * 1000);
                break;
            case '6h':
                timeThreshold = now - (6 * 60 * 60 * 1000);
                break;
            case '24h':
                timeThreshold = now - (24 * 60 * 60 * 1000);
                break;
            case '7d':
                timeThreshold = now - (7 * 24 * 60 * 60 * 1000);
                break;
        }

        // Get messages from processed_messages collection
        let messagesQuery = db.collection('processed_messages')
            .where('timestamp', '>=', timeThreshold);

        if (projectId) {
            messagesQuery = messagesQuery.where('projectContext', '==', projectId);
        }

        const messagesSnapshot = await messagesQuery.get();
        const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        // Calculate metrics
        const totalMessages = messages.length;
        const aiResponses = messages.filter((msg: any) => msg.aiResponse).length;
        const userQuestions = messages.filter((msg: any) =>
            msg.message && (
                msg.message.includes('?') ||
                msg.message.toLowerCase().includes('how') ||
                msg.message.toLowerCase().includes('what') ||
                msg.message.toLowerCase().includes('why')
            )
        ).length;

        // Group messages by user for team communication data
        const userMessageCounts = messages.reduce((acc: Record<string, number>, msg: any) => {
            if (msg.userId) {
                acc[msg.userId] = (acc[msg.userId] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        // Get users for team communication
        const usersSnapshot = await db.collection('users').get();
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        const teamComm = users.map((user: any) => ({
            memberId: user.id,
            memberName: user.name || 'Unknown User',
            messagesCount: userMessageCounts[user.id] || 0,
            questionsAsked: messages.filter((msg: any) =>
                msg.userId === user.id &&
                msg.message && msg.message.includes('?')
            ).length,
            questionsAnswered: messages.filter((msg: any) =>
                msg.userId === user.id && msg.aiResponse
            ).length,
            codeSnippetsShared: 0, // TODO: Implement code detection
            lastActiveTime: messages
                .filter((msg: any) => msg.userId === user.id)
                .sort((a: any, b: any) => b.timestamp - a.timestamp)[0]?.timestamp || 0,
            responseTime: 0 // TODO: Calculate average response time
        }));

        // Calculate hourly trends (last 24 hours)
        const trends = Array.from({ length: 24 }, (_, i) => {
            const hourStart = now - ((23 - i) * 60 * 60 * 1000);
            const hourEnd = hourStart + (60 * 60 * 1000);

            const hourMessages = messages.filter((msg: any) =>
                msg.timestamp >= hourStart && msg.timestamp < hourEnd
            );

            return {
                hour: i,
                messageCount: hourMessages.length,
                urgentCount: 0, // TODO: Implement urgency detection
                aiResponseCount: hourMessages.filter((msg: any) => msg.aiResponse).length
            };
        });

        return {
            success: true,
            metrics: {
                totalMessages,
                aiResponses,
                userQuestions,
                codeShares: 0, // TODO: Implement
                urgentMessages: 0, // TODO: Implement
                averageResponseTime: 0 // TODO: Implement
            },
            teamComm,
            trends,
            timeframe,
            timestamp: now
        };

    } catch (error) {
        console.error('Error getting communication metrics:', error);
        throw new functions.https.HttpsError('internal', 'Failed to get communication metrics', error);
    }
});

// Callable function for getting project data
export const getProject = functions.https.onCall(async (data, context) => {
    console.log('getProject called with data:', data);

    const { userId } = data;

    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
    }

    try {
        const db = getFirestore();

        // Get user's projects (Callable functions run with admin privileges)
        const projectsSnapshot = await db.collection('projects')
            .where('userId', '==', userId)
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        console.log('Projects found:', projectsSnapshot.size);

        if (projectsSnapshot.empty) {
            return {
                success: false,
                project: null,
                message: 'No projects found for user'
            };
        }

        const projectDoc = projectsSnapshot.docs[0];
        if (!projectDoc) {
            return {
                success: false,
                project: null,
                message: 'No project document found'
            };
        }

        const projectData = projectDoc.data();

        console.log('Returning project:', projectDoc.id);

        return {
            success: true,
            project: {
                id: projectDoc.id,
                ...projectData
            }
        };
    } catch (error) {
        console.error('Error getting project:', error);
        throw new functions.https.HttpsError('internal', 'Failed to get project', error);
    }
});

// Callable function for getting chat history
export const getChatHistory = functions.https.onCall(async (data, context) => {
    console.log('getChatHistory called with data:', data);

    const { userId, projectId, limit = 50, offset = 0 } = data;

    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'User ID is required');
    }

    try {
        const db = getFirestore();

        // Build query - if we have a projectId, include it in the filter
        let query = db.collection('processed_messages')
            .where('userId', '==', userId);

        if (projectId) {
            query = query.where('projectId', '==', projectId);
        }

        const messages = await query
            .orderBy('timestamp', 'desc')
            .limit(parseInt(limit))
            .offset(parseInt(offset))
            .get();

        console.log('Messages found:', messages.size);

        const history = messages.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return {
            success: true,
            messages: history,
            total: messages.size,
            hasMore: messages.size === parseInt(limit)
        };
    } catch (error) {
        console.error('Error fetching chat history:', error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch chat history', error);
    }
});

// Callable function for creating a project
export const createProject = functions.https.onCall(async (data, context) => {
    console.log('createProject called with data:', data);

    const { userId, projectData, githubRepo } = data;

    if (!userId || !projectData) {
        throw new functions.https.HttpsError('invalid-argument', 'User ID and project data are required');
    }

    try {
        const db = getFirestore();
        const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Save project to Firestore
        await db.collection('projects').doc(projectId).set({
            ...projectData,
            userId,
            githubRepo: githubRepo || null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: 'active'
        });

        console.log('Project created:', projectId);

        return {
            success: true,
            projectId,
            message: 'Project created successfully'
        };
    } catch (error) {
        console.error('Error creating project:', error);
        throw new functions.https.HttpsError('internal', 'Failed to create project', error);
    }
});

// Callable function for sending messages with full agent processing
export const sendMessage = functions.https.onCall(async (data, context) => {
    console.log('sendMessage called with data:', data);

    const { userId, message, projectContext } = data;

    if (!userId || !message) {
        throw new functions.https.HttpsError('invalid-argument', 'User ID and message are required');
    }

    try {
        const db = getFirestore();
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log('🤖 Processing message through agent system...');

        // Initialize the agent system if not already done
        const { AgentManager } = await import('../core/agentManager');
        const agentManager = new AgentManager(db);
        await agentManager.initialize();

        // Get the communication hub
        const communicationHub = agentManager.getAgent('communication_hub');

        if (!communicationHub) {
            throw new Error('Communication hub not initialized');
        }

        // Process message through the proper agent architecture
        console.log('📨 Routing message through UserCommunicationHub...');
        const processedResult = await communicationHub.handleIncomingMessage(
            userId,
            message,
            {
                projectId: projectContext,
                messageId: messageId,
                timestamp: Date.now()
            }
        );

        // The agent system should handle saving and generating responses
        // Let's check if we got a response from the agents
        console.log('✅ Message processed through agent system');

        return {
            success: true,
            messageId,
            message: 'Message processed by agent system',
            response: processedResult?.aiResponse || 'Message processed successfully through the multi-agent system.',
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('Error processing message through agents:', error);

        // Fallback: save message without agent processing
        try {
            const db = getFirestore();
            const fallbackMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            await db.collection('processed_messages').doc(fallbackMessageId).set({
                userId,
                message,
                projectContext: projectContext || {},
                timestamp: Date.now(),
                status: 'received',
                error: 'Agent processing failed, fallback mode'
            });

            return {
                success: true,
                messageId: fallbackMessageId,
                message: 'Message received (agent system temporarily unavailable)',
                response: 'I apologize, but the coordination system is currently unavailable. Your message has been saved and will be processed when the system is restored.',
                timestamp: Date.now()
            };
        } catch (saveError) {
            console.error('Failed to save message after agent error:', saveError);
            throw new functions.https.HttpsError('internal', 'Failed to process message', error);
        }
    }
});// Callable function for getting roadmap data
export const getRoadmap = functions.https.onCall(async (data, context) => {
    console.log('🚀 getRoadmap called with data:', JSON.stringify(data, null, 2));

    const { projectId } = data;

    if (!projectId) {
        throw new functions.https.HttpsError('invalid-argument', 'Project ID is required');
    }

    console.log('🔍 STARTING ROADMAP GENERATION');
    console.log('🆔 Input Project ID:', projectId);
    console.log('🆔 Project ID type:', typeof projectId);
    console.log('🆔 Project ID length:', projectId.length);

    try {
        const db = getFirestore();

        // First, let's see what projects actually exist in the database
        console.log('📋 LISTING ALL PROJECTS IN DATABASE:');
        const allProjectsSnapshot = await db.collection('projects').get();
        console.log('📊 Total projects in database:', allProjectsSnapshot.size);

        allProjectsSnapshot.docs.forEach((doc, index) => {
            console.log(`📋 Project ${index + 1}:`, {
                id: doc.id,
                userId: doc.data().userId,
                name: doc.data().name,
                status: doc.data().status,
                createdAt: doc.data().createdAt
            });
        });

        // Get project information to see if there's GitHub repo data
        const projectDoc = await db.collection('projects').doc(projectId).get();
        let repositoryInfo = null;

        console.log('=== PROJECT DOCUMENT DEBUG ===');
        console.log('🎯 Project document exists:', projectDoc.exists);
        console.log('🎯 Project ID being queried:', projectId);

        if (projectDoc.exists) {
            const projectData = projectDoc.data();
            console.log('✅ PROJECT FOUND!');
            console.log('📄 Raw project data:', JSON.stringify(projectData, null, 2));
            console.log('📄 Project data keys:', Object.keys(projectData || {}));
            console.log('📄 Project name:', projectData?.name);
            console.log('📄 Project userId:', projectData?.userId);
            console.log('📄 Project status:', projectData?.status);
            console.log('📄 Project goals exists:', !!projectData?.goals);
            console.log('📄 Project goals is array:', Array.isArray(projectData?.goals));
            console.log('📄 Project goals length:', projectData?.goals?.length);

            if (projectData?.goals && Array.isArray(projectData.goals)) {
                console.log('🎯 GOALS ARRAY DETAILED ANALYSIS:');
                projectData.goals.forEach((goal, index) => {
                    console.log(`Goal ${index + 1}:`, {
                        id: goal.id,
                        title: goal.title,
                        descriptionLength: goal.description?.length,
                        priority: goal.priority
                    });
                });
            }

            repositoryInfo = projectData?.github || projectData?.repository || projectData?.githubRepo;
            console.log('🔗 Repository info found:', repositoryInfo);

            // If we found a githubRepo but it's not in the expected format, convert it
            if (repositoryInfo && typeof repositoryInfo === 'string') {
                repositoryInfo = { url: repositoryInfo };
            }

            // For now, if no explicit repo is set, we'll analyze the project based on its goals
            // In the future, this could be enhanced to auto-detect repo from project context
            if (!repositoryInfo) {
                console.log('ℹ️ No repository info found - will generate roadmap from project goals only');
            }
        } else {
            console.log('❌ PROJECT NOT FOUND! Document does not exist for ID:', projectId);
            console.log('❌ This means frontend is using wrong project ID!');
            console.log('❌ Frontend should use one of the project IDs listed above');
        }

        // Get team members for the project (using dynamic loading)
        console.log('👥 LOADING TEAM MEMBERS...');
        const usersSnapshot = await db.collection('users').where('status', '==', 'active').get();
        console.log('👥 Active users found:', usersSnapshot.size);

        const teamMembers = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || `User ${doc.id.substring(0, 8)}`,
            email: doc.data().email || `${doc.id}@example.com`,
            skills: doc.data().skills || ['Programming'],
            experience: doc.data().experience || 'intermediate'
        }));

        console.log('👥 Team members loaded:', teamMembers.map(m => ({ id: m.id, name: m.name })));

        // Analyze repository structure if available
        let repositoryAnalysis = null;
        if (repositoryInfo && repositoryInfo.url) {
            console.log('🔍 Analyzing repository:', repositoryInfo.url);
            repositoryAnalysis = await analyzeRepositoryStructure(repositoryInfo);
            console.log('🔍 Repository analysis result:', repositoryAnalysis);
        } else {
            console.log('⚠️ No repository to analyze');
        }

        // Get project data for enhanced roadmap generation
        const projectData = projectDoc.exists ? projectDoc.data() : null;
        console.log('📊 ROADMAP GENERATION INPUT SUMMARY:');
        console.log('📊 Project data exists:', !!projectData);
        console.log('📊 Project goals found:', !!projectData?.goals);
        console.log('📊 Goals array length:', projectData?.goals?.length || 0);
        console.log('📊 Repository analysis available:', !!repositoryAnalysis);
        console.log('📊 Team members count:', teamMembers.length);

        if (projectData?.goals && Array.isArray(projectData.goals) && projectData.goals.length > 0) {
            console.log('🎯 Sample goals for verification:');
            console.log('🎯 Goal 1:', JSON.stringify(projectData.goals[0], null, 2));
            if (projectData.goals.length > 1) {
                console.log('🎯 Goal 2:', JSON.stringify(projectData.goals[1], null, 2));
            }
        }

        // Generate dynamic roadmap based on actual repository analysis and project data
        console.log('🏗️ CALLING generateRoadmapFromAnalysis...');
        const roadmapData = generateRoadmapFromAnalysis(repositoryAnalysis, teamMembers, projectId, projectData);
        console.log('🏗️ Roadmap generation completed');
        console.log('🏗️ Generated roadmap phases:', roadmapData?.phases?.length || 0);
        console.log('🏗️ Overall progress:', roadmapData?.metrics?.overallProgress || 0);

        console.log('✅ Returning roadmap for project:', projectId);

        return {
            success: true,
            ...roadmapData
        };
    } catch (error) {
        console.error('Error getting roadmap:', error);
        throw new functions.https.HttpsError('internal', 'Failed to get roadmap data', error);
    }
});

// Helper function to analyze repository structure
async function analyzeRepositoryStructure(repositoryInfo: any) {
    try {
        // Extract owner and repo from GitHub URL
        const urlParts = repositoryInfo.url.replace('https://github.com/', '').split('/');
        const owner = urlParts[0];
        const repo = urlParts[1];

        console.log(`Analyzing repository: ${owner}/${repo}`);

        // For now, return mock analysis based on the actual project structure
        // In a real implementation, you'd use GitHub API here
        return {
            owner,
            repo,
            languages: ['TypeScript', 'JavaScript', 'HTML', 'CSS'],
            frameworks: ['React', 'Firebase', 'Vite', 'Tailwind'],
            structure: {
                hasBackend: true,
                hasFrontend: true,
                hasDatabase: true,
                hasTesting: false,
                hasDocumentation: true
            },
            files: {
                totalFiles: 45,
                codeFiles: 32,
                configFiles: 8,
                documentationFiles: 5
            },
            complexity: 'medium'
        };
    } catch (error) {
        console.error('Error analyzing repository:', error);
        return null;
    }
}

// Helper function to generate roadmap from repository analysis
function generateRoadmapFromAnalysis(analysis: any, teamMembers: any[], projectId: string, projectData?: any) {
    const now = Date.now();

    console.log('🏗️ === ROADMAP GENERATION ANALYSIS ===');
    console.log('🏗️ Function called with:');
    console.log('🏗️   - Analysis exists:', !!analysis);
    console.log('🏗️   - ProjectData exists:', !!projectData);
    console.log('🏗️   - Project data has goals:', !!projectData?.goals);
    console.log('🏗️   - Goals is array:', Array.isArray(projectData?.goals));
    console.log('🏗️   - Goals array length:', projectData?.goals?.length || 0);
    console.log('🏗️   - Team members count:', teamMembers.length);
    console.log('🏗️   - Project ID:', projectId);

    // If we have project data with goals, use them to create a more accurate roadmap
    if (projectData && projectData.goals && Array.isArray(projectData.goals)) {
        console.log('✅ GENERATING ROADMAP FROM PROJECT GOALS');
        console.log('✅ Number of phases to generate:', projectData.goals.length);
        return generateRoadmapFromProjectGoals(projectData, teamMembers, projectId, analysis);
    }

    console.log('⚠️ FALLING BACK TO BASIC/ANALYSIS ROADMAP');
    console.log('⚠️ Reason: No valid project goals found');
    if (!analysis) {
        console.log('No analysis - using basic roadmap');
        // Fallback to basic roadmap if no analysis available
        return generateBasicRoadmap(teamMembers, projectId);
    }

    const phases = [];
    let totalTasks = 0;
    let completedTasks = 0;

    // Phase 1: Repository Setup & Analysis (completed since we're analyzing)
    phases.push({
        id: 'setup',
        name: 'Repository Setup & Analysis',
        status: 'completed',
        progress: 100,
        duration: 2,
        tasks: [
            {
                id: 'repo-analysis',
                name: 'Repository Structure Analysis',
                description: `Analyzed ${analysis.repo} repository with ${analysis.files.totalFiles} files`,
                status: 'completed',
                assignee: teamMembers[0]?.name || 'AI Agent',
                estimatedHours: 1,
                actualHours: 1,
                priority: 'high'
            },
            {
                id: 'tech-stack',
                name: 'Technology Stack Identification',
                description: `Identified: ${analysis.frameworks.join(', ')}`,
                status: 'completed',
                assignee: teamMembers[0]?.name || 'Tech Lead',
                estimatedHours: 1,
                actualHours: 1,
                priority: 'medium'
            }
        ]
    });
    totalTasks += 2;
    completedTasks += 2;

    // Phase 2: Development (based on what exists in repo)
    const devTasks = [];

    if (analysis.structure.hasFrontend) {
        devTasks.push({
            id: 'frontend-development',
            name: 'Frontend Development',
            description: 'React dashboard with TypeScript, routing, and component architecture',
            status: 'in-progress',
            assignee: teamMembers[0]?.name || 'Frontend Dev',
            estimatedHours: 20,
            actualHours: 15,
            priority: 'high'
        });
    }

    if (analysis.structure.hasBackend) {
        devTasks.push({
            id: 'backend-development',
            name: 'Backend API Development',
            description: 'Firebase Cloud Functions with callable endpoints and Firestore integration',
            status: 'in-progress',
            assignee: teamMembers[1]?.name || 'Backend Dev',
            estimatedHours: 25,
            actualHours: 18,
            priority: 'critical'
        });
    }

    if (analysis.structure.hasDatabase) {
        devTasks.push({
            id: 'database-setup',
            name: 'Database Configuration',
            description: 'Firestore collections, indexes, and security rules',
            status: 'completed',
            assignee: teamMembers[2]?.name || 'DB Admin',
            estimatedHours: 8,
            actualHours: 6,
            priority: 'high'
        });
        completedTasks += 1;
    }

    phases.push({
        id: 'development',
        name: 'Core Development',
        status: 'in-progress',
        progress: 70,
        duration: devTasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0),
        tasks: devTasks
    });
    totalTasks += devTasks.length;

    // Phase 3: Testing & Quality Assurance
    const testingTasks = [
        {
            id: 'unit-testing',
            name: 'Unit Testing',
            description: 'Write unit tests for components and functions',
            status: analysis.structure.hasTesting ? 'in-progress' : 'pending',
            assignee: teamMembers[0]?.name || 'QA Engineer',
            estimatedHours: 12,
            actualHours: analysis.structure.hasTesting ? 5 : 0,
            priority: 'medium'
        },
        {
            id: 'integration-testing',
            name: 'Integration Testing',
            description: 'Test Firebase functions and frontend integration',
            status: 'pending',
            assignee: teamMembers[1]?.name || 'Test Lead',
            estimatedHours: 8,
            actualHours: 0,
            priority: 'medium'
        }
    ];

    phases.push({
        id: 'testing',
        name: 'Testing & QA',
        status: 'pending',
        progress: analysis.structure.hasTesting ? 30 : 0,
        duration: testingTasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0),
        tasks: testingTasks
    });
    totalTasks += testingTasks.length;

    // Phase 4: Documentation & Deployment
    const docTasks = [
        {
            id: 'documentation',
            name: 'Documentation',
            description: 'API documentation, setup guides, and user manual',
            status: analysis.structure.hasDocumentation ? 'in-progress' : 'pending',
            assignee: teamMembers[0]?.name || 'Tech Writer',
            estimatedHours: 6,
            actualHours: analysis.structure.hasDocumentation ? 3 : 0,
            priority: 'low'
        },
        {
            id: 'deployment',
            name: 'Production Deployment',
            description: 'Deploy to Firebase hosting and configure production environment',
            status: 'pending',
            assignee: teamMembers[1]?.name || 'DevOps',
            estimatedHours: 4,
            actualHours: 0,
            priority: 'medium'
        }
    ];

    phases.push({
        id: 'deployment',
        name: 'Documentation & Deployment',
        status: 'pending',
        progress: analysis.structure.hasDocumentation ? 25 : 0,
        duration: docTasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0),
        tasks: docTasks
    });
    totalTasks += docTasks.length;

    const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
        projectId,
        lastUpdated: now,
        phases,
        teamMembers,
        repositoryInfo: {
            url: `https://github.com/${analysis.owner}/${analysis.repo}`,
            languages: analysis.languages,
            frameworks: analysis.frameworks
        },
        metrics: {
            totalTasks,
            completedTasks,
            inProgressTasks: totalTasks - completedTasks,
            overallProgress
        },
        aiRecommendations: generateAIRecommendations(analysis, phases)
    };
}

// Helper function to generate roadmap from project goals
function generateRoadmapFromProjectGoals(projectData: any, teamMembers: any[], projectId: string, analysis?: any) {
    const now = Date.now();
    const phases: any[] = [];
    let totalTasks = 0;
    let completedTasks = 0;

    console.log('🎯 === GENERATING ROADMAP FROM PROJECT GOALS ===');
    console.log('🎯 Project data received:', !!projectData);
    console.log('🎯 Goals array:', projectData?.goals?.length || 0, 'items');
    console.log('🎯 Team members:', teamMembers.length);
    console.log('🎯 Analysis available:', !!analysis);

    // Convert project goals to roadmap phases
    if (!projectData.goals || !Array.isArray(projectData.goals)) {
        console.log('❌ ERROR: Invalid goals data structure');
        console.log('❌ Goals type:', typeof projectData.goals);
        console.log('❌ Goals value:', projectData.goals);
        return generateBasicRoadmap(teamMembers, projectId);
    }

    console.log('🔄 Processing goals into phases...');
    projectData.goals.forEach((goal: any, index: number) => {
        console.log(`🔄 Processing goal ${index + 1}/${projectData.goals.length}:`, {
            id: goal.id,
            title: goal.title,
            description: goal.description ? `${goal.description.substring(0, 100)}...` : 'No description'
        });
        const phase: any = {
            id: goal.id || `phase-${index}`,
            name: goal.title || `Phase ${index + 1}`,
            status: 'pending', // All phases start as pending for new projects
            progress: 0, // No artificial progress simulation
            duration: 15, // Assuming each phase takes about 15 hours for hackathon
            tasks: [] as any[]
        };

        console.log(`📋 Created phase: ${phase.name} (${phase.status})`);

        // Parse tasks from the description (which has the ├── format)
        const taskDescriptions = goal.description ? goal.description.split('├──').filter((task: string) => task.trim()) : [];
        console.log(`📋 Found ${taskDescriptions.length} task descriptions to parse`);

        taskDescriptions.forEach((taskDesc: string, taskIndex: number) => {
            const cleanTask = taskDesc.replace(/└──/g, '').replace(/[🎖️🧠📊🤖🔍💾🔄📊🎲⚡🛡️🧪📈🚀🌐📚🎪🔧💪🎤🏆]/g, '').trim();

            if (cleanTask) {
                console.log(`  📝 Task ${taskIndex + 1}: ${cleanTask.substring(0, 50)}...`);

                const task: any = {
                    id: `${goal.id}-task-${taskIndex}`,
                    name: cleanTask,
                    description: `Implementation of ${cleanTask.toLowerCase()} for ${goal.title}`,
                    status: 'pending', // All tasks start as pending for new projects
                    assignee: teamMembers[taskIndex % teamMembers.length]?.name || 'AI Agent',
                    estimatedHours: Math.ceil(15 / taskDescriptions.length), // Distribute hours across tasks
                    actualHours: 0, // No artificial hours for new projects
                    priority: goal.priority || 'medium'
                };

                phase.tasks.push(task);
                totalTasks++;

                if (task.status === 'completed') {
                    completedTasks++;
                }
            } else {
                console.log(`  ⚠️ Empty task after cleaning: "${taskDesc}"`);
            }
        });

        console.log(`📋 Phase "${phase.name}" completed with ${phase.tasks.length} tasks`);
        phases.push(phase);
    });

    const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    console.log('🎯 ROADMAP GENERATION COMPLETED');
    console.log('🎯 Total phases generated:', phases.length);
    console.log('🎯 Total tasks:', totalTasks);
    console.log('🎯 Completed tasks:', completedTasks);
    console.log('🎯 Overall progress:', overallProgress, '%');
    console.log('🎯 Phase names:', phases.map(p => p.name));

    // Generate AI recommendations based on project data
    const aiRecommendations = [];
    if (phases.length > 6) {
        aiRecommendations.push("Large number of phases detected - consider prioritizing critical phases first");
    }
    if (projectData.deadline) {
        const deadline = new Date(projectData.deadline);
        const now = new Date();
        const hoursLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60));
        if (hoursLeft < 24) {
            aiRecommendations.push(`⚠️ Only ${hoursLeft} hours remaining until deadline - focus on MVP features`);
        }
    }
    aiRecommendations.push("Use ensemble LLM approach for complex coding problems as specified in project goals");
    aiRecommendations.push("Implement AI agent command structure for optimal task delegation");

    console.log('🎯 AI Recommendations generated:', aiRecommendations.length);

    const result = {
        projectId,
        lastUpdated: now,
        phases,
        teamMembers,
        repositoryInfo: analysis ? {
            url: `https://github.com/${analysis.owner}/${analysis.repo}`,
            languages: analysis.languages || ['TypeScript', 'JavaScript', 'Python'],
            frameworks: analysis.frameworks || ['React', 'Firebase']
        } : {
            // Use generic repository info when no specific repo is provided
            languages: projectData.techStack || ['TypeScript', 'JavaScript', 'Python'],
            frameworks: ['React', 'Firebase', 'Vite']
        },
        metrics: {
            totalTasks,
            completedTasks,
            inProgressTasks: totalTasks - completedTasks,
            overallProgress
        },
        aiRecommendations,
        projectDetails: {
            name: projectData.name,
            description: projectData.description,
            deadline: projectData.deadline,
            techStack: projectData.techStack || []
        }
    };

    console.log('🎯 Final roadmap result structure:');
    console.log('🎯   - projectId:', result.projectId);
    console.log('🎯   - phases count:', result.phases.length);
    console.log('🎯   - metrics:', result.metrics);
    console.log('🎯   - project details:', !!result.projectDetails);

    return result;
}

// Helper function for basic roadmap when no repository analysis is available
function generateBasicRoadmap(teamMembers: any[], projectId: string) {
    return {
        projectId,
        lastUpdated: Date.now(),
        phases: [
            {
                id: 'planning',
                name: 'Planning & Setup',
                status: 'completed',
                progress: 100,
                duration: 4,
                tasks: [
                    {
                        id: 'requirements',
                        name: 'Requirements Analysis',
                        description: 'Define project scope and requirements',
                        status: 'completed',
                        assignee: teamMembers[0]?.name || 'Team Lead',
                        estimatedHours: 2,
                        actualHours: 2,
                        priority: 'high'
                    }
                ]
            }
        ],
        teamMembers,
        metrics: {
            totalTasks: 1,
            completedTasks: 1,
            inProgressTasks: 0,
            overallProgress: 100
        }
    };
}

// Helper function to generate AI recommendations
function generateAIRecommendations(analysis: any, phases: any[]) {
    const recommendations = [];

    if (analysis) {
        if (analysis.complexity === 'high') {
            recommendations.push("Consider breaking down complex components into smaller, manageable modules");
        }

        if (!analysis.structure.hasTesting) {
            recommendations.push("Implement unit testing to improve code quality and reliability");
        }

        if (analysis.files.totalFiles > 50) {
            recommendations.push("Large codebase detected - consider implementing automated code review");
        }

        const inProgressPhases = phases.filter(p => p.status === 'in-progress').length;
        if (inProgressPhases > 2) {
            recommendations.push("Multiple phases in progress - consider focusing on completing one phase at a time");
        }
    }

    return recommendations;
}

// Callable function for getting all available projects
export const getAllProjects = functions.https.onCall(async (data, context) => {
    const timestamp = new Date().toISOString();
    console.log(`🔍 [${timestamp}] getAllProjects called with data:`, JSON.stringify(data, null, 2));

    try {
        const db = getFirestore();

        console.log(`📋 [${timestamp}] Fetching all projects from Firestore...`);

        // Get all projects from the projects collection
        const projectsSnapshot = await db.collection('projects').get();

        console.log(`📊 [${timestamp}] Found ${projectsSnapshot.size} projects in database`);

        const projects = [];

        for (const doc of projectsSnapshot.docs) {
            const projectData = doc.data();
            const projectId = doc.id;

            console.log(`📄 [${timestamp}] Processing project ${projectId}:`, {
                name: projectData.name,
                userId: projectData.userId,
                status: projectData.status,
                hasGoals: !!projectData.goals
            });

            // Format project data for frontend
            const project = {
                id: projectId,
                name: projectData.name || 'Untitled Project',
                description: projectData.description || 'No description provided',
                techStack: projectData.techStack || [],
                deadline: projectData.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default to 7 days from now
                organizerId: projectData.userId || 'unknown',
                organizerName: projectData.organizerName || 'Unknown Organizer',
                participantCount: projectData.participantCount || 1,
                maxParticipants: projectData.maxParticipants || 8,
                status: projectData.status || 'open',
                goals: projectData.goals || [],
                createdAt: projectData.createdAt,
                lastUpdated: projectData.lastUpdated || Date.now()
            };

            projects.push(project);
        }

        // Filter to only return active/open projects that aren't full
        const availableProjects = projects.filter(project =>
            (project.status === 'open' || project.status === 'active') &&
            (!project.maxParticipants || project.participantCount < project.maxParticipants)
        );

        console.log(`✅ [${timestamp}] getAllProjects result:`, {
            totalProjects: projects.length,
            availableProjects: availableProjects.length,
            projectIds: availableProjects.map(p => p.id)
        });

        return {
            success: true,
            projects: availableProjects,
            totalCount: projects.length,
            availableCount: availableProjects.length,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error(`💥 [${timestamp}] getAllProjects error:`, {
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : 'No stack'
        });

        throw new functions.https.HttpsError('internal', `Failed to get projects: ${error instanceof Error ? error.message : String(error)}`);
    }
});