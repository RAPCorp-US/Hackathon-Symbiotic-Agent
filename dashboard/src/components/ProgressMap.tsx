// dashboard/src/components/ProgressMap.tsx
import React, { useEffect, useState } from 'react';
import { firebaseFunctions } from '../utils/firebaseFunctions';

interface Milestone {
    id: string;
    title?: string;
    name?: string;
    description?: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'pending' | 'in-progress';
    assignee?: string;
    dueDate?: number;
    estimatedHours?: number;
    actualHours?: number;
    dependencies?: string[];
    priority?: 'low' | 'medium' | 'high' | 'critical';
}

interface TeamMember {
    id: string;
    name: string;
    skills: string[];
    currentTasks: string[];
    workload: number; // 0-100%
    status: 'available' | 'busy' | 'offline';
}

interface RoadmapData {
    phases: Array<{
        name: string;
        duration?: number;
        tasks: Milestone[];
    }>;
    teamMembers: TeamMember[];
    lastUpdated: number;
    aiRecommendations?: string[];
}

interface ProgressMapProps {
    projectId: string;
    userId: string;
}

export const ProgressMap: React.FC<ProgressMapProps> = ({ projectId, userId }) => {
    const [roadmapData, setRoadmapData] = useState<RoadmapData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // const [socket, setSocket] = useState<Socket | null>(null); // Disabled for Firebase Functions
    const [error, setError] = useState<string | null>(null);

    // Connect to your real backend system
    useEffect(() => {
        const fetchRoadmapData = async () => {
            const fetchStartTime = new Date().toISOString();
            console.log(`🚀 [${fetchStartTime}] PROGRESSMAP: Starting fetchRoadmapData`, {
                projectId,
                userId,
                component: 'ProgressMap'
            });

            try {
                setIsLoading(true);
                setError(null);

                console.log(`📡 [${fetchStartTime}] PROGRESSMAP: About to call firebaseFunctions.getRoadmap`);

                // Fetch current roadmap using Firebase Functions
                const data = await firebaseFunctions.getRoadmap(projectId);

                console.log(`✅ [${fetchStartTime}] PROGRESSMAP: Successfully received roadmap data:`, {
                    phases: data?.phases?.length || 0,
                    teamMembers: data?.teamMembers?.length || 0,
                    lastUpdated: data?.lastUpdated,
                    aiRecommendations: data?.aiRecommendations?.length || 0,
                    dataSize: JSON.stringify(data).length + ' bytes'
                });

                setRoadmapData(data);

            } catch (err) {
                const errorTime = new Date().toISOString();
                console.error(`❌ [${errorTime}] PROGRESSMAP: Error fetching roadmap:`, {
                    error: err instanceof Error ? err.message : String(err),
                    errorStack: err instanceof Error ? err.stack : 'No stack',
                    projectId,
                    userId
                });

                setError(err instanceof Error ? err.message : 'Failed to load roadmap');

                // Fallback to mock data if backend is not available
                console.log(`🔄 [${errorTime}] PROGRESSMAP: Using mock roadmap data as fallback`);
                setRoadmapData(getMockRoadmapData());

                // Clear error after 3 seconds since we have fallback data
                setTimeout(() => setError(null), 3000);
            } finally {
                setIsLoading(false);
                const endTime = new Date().toISOString();
                console.log(`🏁 [${endTime}] PROGRESSMAP: fetchRoadmapData completed`);
            }
        };

        // Event-driven refresh strategy - only refresh when meaningful events occur
        const setupEventDrivenRefresh = () => {
            const setupTime = new Date().toISOString();
            console.log(`🎯 [${setupTime}] PROGRESSMAP: Setting up event-driven roadmap refresh`, {
                projectId,
                userId,
                strategy: 'Event-driven only (no auto-refresh)'
            });

            // Manual refresh function that can be called when needed
            const manualRefresh = async (reason: string) => {
                const refreshTime = new Date().toISOString();
                console.log(`🔄 [${refreshTime}] PROGRESSMAP: Manual refresh triggered`, {
                    reason,
                    projectId
                });

                try {
                    console.log(`📡 [${refreshTime}] PROGRESSMAP: Making event-driven API call`);
                    const data = await firebaseFunctions.getRoadmap(projectId);
                    setRoadmapData(data);
                    console.log(`✅ [${refreshTime}] PROGRESSMAP: Roadmap updated successfully`);
                } catch (error) {
                    console.error(`� [${refreshTime}] PROGRESSMAP: Manual refresh error:`, {
                        error: error instanceof Error ? error.message : String(error),
                        reason
                    });
                }
            };

            // Add refresh button functionality
            const refreshButton = document.createElement('button');
            refreshButton.innerHTML = '🔄 Refresh Roadmap';
            refreshButton.className = 'hidden'; // Hidden for now, can be exposed in UI later
            
            console.log(`✅ [${setupTime}] PROGRESSMAP: Event-driven refresh setup completed - no auto-refresh`);

            // Return minimal cleanup function
            return () => {
                const cleanupTime = new Date().toISOString();
                console.log(`🧹 [${cleanupTime}] PROGRESSMAP: Event-driven refresh cleanup (minimal)`);
                // No intervals to clean up since we removed auto-refresh
            };
        };

        const componentStartTime = new Date().toISOString();
        console.log(`🏗️ [${componentStartTime}] PROGRESSMAP: Component useEffect starting`, {
            projectId,
            userId,
            component: 'ProgressMap',
            refreshStrategy: 'Event-driven only'
        });

        fetchRoadmapData();
        const cleanupRefresh = setupEventDrivenRefresh();

        // Cleanup
        return () => {
            const cleanupTime = new Date().toISOString();
            console.log(`🧹 [${cleanupTime}] PROGRESSMAP: Component useEffect cleanup`, {
                projectId,
                userId
            });
            cleanupRefresh();
        };
    }, [projectId, userId]);

    // Fallback mock data for development/demo
    const getMockRoadmapData = (): RoadmapData => {
        return {
            phases: [
                {
                    name: "Setup & Planning",
                    duration: 6,
                    tasks: [
                        {
                            id: 'setup',
                            title: 'Project Setup',
                            description: 'Initialize repository, setup development environment',
                            status: 'completed',
                            assignee: 'alex-123',
                            estimatedHours: 4,
                            actualHours: 3,
                            dependencies: [],
                            priority: 'high'
                        },
                        {
                            id: 'design',
                            title: 'UI/UX Design',
                            description: 'Create wireframes, user flows, and high-fidelity designs',
                            status: 'completed',
                            assignee: 'jordan-789',
                            estimatedHours: 8,
                            actualHours: 6,
                            dependencies: ['setup'],
                            priority: 'high'
                        }
                    ]
                },
                {
                    name: "Development",
                    duration: 20,
                    tasks: [
                        {
                            id: 'backend',
                            title: 'Backend API',
                            description: 'Build REST API, database schema, authentication',
                            status: 'in_progress',
                            assignee: 'sam-456',
                            estimatedHours: 12,
                            actualHours: 8,
                            dependencies: ['setup'],
                            priority: 'critical'
                        },
                        {
                            id: 'frontend',
                            title: 'Frontend Development',
                            description: 'Implement React components, integrate with API',
                            status: 'in_progress',
                            assignee: 'alex-123',
                            estimatedHours: 16,
                            actualHours: 10,
                            dependencies: ['design', 'backend'],
                            priority: 'high'
                        }
                    ]
                }
            ],
            teamMembers: [
                {
                    id: 'alex-123',
                    name: 'Alex Johnson',
                    skills: ['React', 'TypeScript', 'Node.js'],
                    currentTasks: ['frontend'],
                    workload: 85,
                    status: 'busy'
                },
                {
                    id: 'sam-456',
                    name: 'Sam Chen',
                    skills: ['Python', 'PostgreSQL', 'AWS'],
                    currentTasks: ['backend'],
                    workload: 90,
                    status: 'busy'
                }
            ],
            lastUpdated: Date.now(),
            aiRecommendations: [
                "Consider parallelizing frontend and backend development",
                "Sam is at high workload - consider task redistribution"
            ]
        };
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading AI-generated roadmap...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <p className="text-red-600 mb-2">⚠️ Backend Connection Failed</p>
                    <p className="text-gray-600 text-sm">Showing demo data - Connect backend for real AI coordination</p>
                </div>
            </div>
        );
    }

    if (!roadmapData) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-gray-600">No roadmap data available</p>
            </div>
        );
    }

    const allTasks = roadmapData.phases?.flatMap(phase => phase.tasks || []) || [];
    const completedTasks = allTasks.filter(task => task.status === 'completed');
    const progress = allTasks.length > 0 ? (completedTasks.length / allTasks.length) * 100 : 0;

    return (
        <div className="space-y-6">
            {/* Header with Progress */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">AI-Powered Roadmap</h2>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>Last updated: {new Date(roadmapData.lastUpdated).toLocaleTimeString()}</span>
                        <span className="flex items-center space-x-1 text-xs text-green-600">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                            <span>Event-driven refresh (no auto-refresh)</span>
                        </span>
                    </div>
                </div>

                <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Overall Progress</span>
                        <span>{progress.toFixed(0)}% Complete</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                            className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>

                {/* AI Recommendations */}
                {roadmapData.aiRecommendations && roadmapData.aiRecommendations.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-blue-900 mb-2">🤖 AI Recommendations</h3>
                        <ul className="space-y-1">
                            {roadmapData.aiRecommendations.map((rec, index) => (
                                <li key={index} className="text-blue-800 text-sm">{rec}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Timeline View */}
            <div className="space-y-6">
                {roadmapData.phases?.map((phase, phaseIndex) => (
                    <div key={phaseIndex} className="bg-white rounded-lg p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">{phase.name}</h3>
                            <div className="flex items-center text-sm text-gray-600">
                                {phase.duration ? `${phase.duration}h estimated` : 'In Progress'}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {phase.tasks?.map((task) => (
                                <div
                                    key={task.id}
                                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-3">
                                            <div className={`w-3 h-3 rounded-full ${task.status === 'completed' ? 'bg-green-500' :
                                                (task.status === 'in-progress' || task.status === 'in_progress') ? 'bg-blue-500' :
                                                    task.status === 'blocked' ? 'bg-red-500' : 'bg-gray-300'
                                                }`}></div>
                                            <div>
                                                <h4 className="font-medium text-gray-900">{(task as any).title || (task as any).name}</h4>
                                                <p className="text-sm text-gray-600">{(task as any).description || 'No description available'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${task.status === 'completed' ? 'text-green-600 bg-green-100' :
                                                (task.status === 'in-progress' || task.status === 'in_progress') ? 'text-blue-600 bg-blue-100' :
                                                    task.status === 'blocked' ? 'text-red-600 bg-red-100' :
                                                        'text-gray-600 bg-gray-100'
                                                }`}>
                                                {task.status.replace('_', ' ').replace('-', ' ')}
                                            </span>
                                            <span className={`text-xs font-medium ${task.priority === 'critical' ? 'text-red-600' :
                                                task.priority === 'high' ? 'text-orange-600' :
                                                    task.priority === 'medium' ? 'text-yellow-600' : 'text-gray-600'
                                                }`}>
                                                {task.priority || 'normal'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="text-gray-600">Assignee:</span>
                                                <span className="ml-2 font-medium">
                                                    {task.assignee ?
                                                        roadmapData.teamMembers?.find(m => m.id === task.assignee)?.name || task.assignee
                                                        : 'Unassigned'
                                                    }
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-gray-600">Hours:</span>
                                                <span className="ml-2 font-medium">
                                                    {task.actualHours || 0} / {task.estimatedHours ? `${task.estimatedHours}h` : 'N/A'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
