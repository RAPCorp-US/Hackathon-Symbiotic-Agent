// dashboard/src/components/CommunicationMetrics.tsx
import React, { useEffect, useState } from 'react';
import { firebaseFunctions } from '../utils/firebaseFunctions';

interface MessageStats {
    totalMessages: number;
    aiResponses: number;
    userQuestions: number;
    codeShares: number;
    urgentMessages: number;
    averageResponseTime: number; // in seconds
}

interface TeamCommunication {
    memberId: string;
    memberName: string;
    messagesCount: number;
    questionsAsked: number;
    questionsAnswered: number;
    codeSnippetsShared: number;
    lastActiveTime: number;
    responseTime: number; // average response time in seconds
}

interface CommunicationTrend {
    hour: number;
    messageCount: number;
    urgentCount: number;
    aiResponseCount: number;
}

interface CommunicationMetricsProps {
    projectId: string;
    timeframe: '1h' | '6h' | '24h' | 'all';
}

export const CommunicationMetrics: React.FC<CommunicationMetricsProps> = ({
    projectId,
    timeframe = '6h'
}) => {
    const [messageStats, setMessageStats] = useState<MessageStats>({
        totalMessages: 0,
        aiResponses: 0,
        userQuestions: 0,
        codeShares: 0,
        urgentMessages: 0,
        averageResponseTime: 0
    });

    const [teamComm, setTeamComm] = useState<TeamCommunication[]>([]);
    const [trends, setTrends] = useState<CommunicationTrend[]>([]);
    const [activeUsers, setActiveUsers] = useState<number>(0);

    useEffect(() => {
        const fetchRealData = async () => {
            const fetchStartTime = new Date().toISOString();

            console.log(`🚀 [${fetchStartTime}] COMMUNICATIONMETRICS: Starting fetchRealData`, {
                projectId,
                timeframe,
                component: 'CommunicationMetrics'
            });

            try {
                console.log(`📡 [${fetchStartTime}] COMMUNICATIONMETRICS: About to call firebaseFunctions.getUsers`);

                const startTime = performance.now();

                // Fetch real users from backend using Firebase Functions
                const result = await firebaseFunctions.getUsers() as any;

                const endTime = performance.now();
                const duration = Math.round(endTime - startTime);

                console.log(`📡 [${fetchStartTime}] COMMUNICATIONMETRICS: Firebase function response received`, {
                    success: result?.success,
                    duration: duration + 'ms',
                    resultKeys: Object.keys(result || {})
                });

                if (!result.success) {
                    console.error(`❌ [${fetchStartTime}] COMMUNICATIONMETRICS: Firebase function failed`, {
                        message: result.message,
                        error: result.error
                    });
                    throw new Error(result.message || 'Failed to fetch users');
                }

                const realUsers = result.users || [];

                console.log(`✅ [${fetchStartTime}] COMMUNICATIONMETRICS: Successfully fetched users`, {
                    usersCount: realUsers.length,
                    resultKeys: Object.keys(result),
                    firstUserSample: realUsers[0] ? {
                        id: realUsers[0].id,
                        name: realUsers[0].name,
                        keys: Object.keys(realUsers[0])
                    } : null
                });

                // For new projects with single users, show zero activity until there's actual communication
                const isNewProject = realUsers.length <= 1;

                console.log(`🔍 [${fetchStartTime}] COMMUNICATIONMETRICS: Project analysis`, {
                    isNewProject,
                    usersCount: realUsers.length,
                    willShowZeroActivity: isNewProject
                });

                const stats: MessageStats = {
                    totalMessages: 0,
                    aiResponses: 0,
                    userQuestions: 0,
                    codeShares: 0,
                    urgentMessages: 0,
                    averageResponseTime: 0
                };

                // Generate team communication data from real users
                const teamCommData: TeamCommunication[] = realUsers.map((user: any, index: number) => {
                    return {
                        memberId: user.id,
                        memberName: user.name || `User ${index + 1}`,
                        messagesCount: 0, // Start with zero until real activity
                        questionsAsked: 0,
                        questionsAnswered: 0,
                        codeSnippetsShared: 0,
                        lastActiveTime: Date.now(), // Show as recently active
                        responseTime: 0
                    };
                });

                // Show helpful message for new projects
                if (teamCommData.length === 0 || isNewProject) {
                    teamCommData.push(
                        {
                            memberId: 'getting-started',
                            memberName: '🚀 Start chatting and collaborating to see metrics here',
                            messagesCount: 0,
                            questionsAsked: 0,
                            questionsAnswered: 0,
                            codeSnippetsShared: 0,
                            lastActiveTime: Date.now(),
                            responseTime: 0
                        }
                    );
                }

                // For new projects, show flat trend data (no artificial activity)
                const trendsData: CommunicationTrend[] = Array.from({ length: 24 }, (_, i) => ({
                    hour: i,
                    messageCount: 0,
                    urgentCount: 0,
                    aiResponseCount: 0
                }));

                console.log(`📊 [${fetchStartTime}] COMMUNICATIONMETRICS: Setting state data`, {
                    stats,
                    teamCommCount: teamCommData.length,
                    trendsCount: trendsData.length,
                    activeUsers: teamCommData.filter(m => m.memberId !== 'getting-started').length
                });

                setMessageStats(stats);
                setTeamComm(teamCommData);
                setTrends(trendsData);
                setActiveUsers(teamCommData.filter(m => m.memberId !== 'getting-started').length);

                console.log(`✅ [${fetchStartTime}] COMMUNICATIONMETRICS: fetchRealData completed successfully`);

            } catch (error) {
                const errorTime = new Date().toISOString();
                console.error(`💥 [${errorTime}] COMMUNICATIONMETRICS: Error fetching real data:`, {
                    error: error instanceof Error ? error.message : String(error),
                    errorStack: error instanceof Error ? error.stack : 'No stack'
                });

                // Fallback for offline mode - show getting started state
                setMessageStats({
                    totalMessages: 0,
                    aiResponses: 0,
                    userQuestions: 0,
                    codeShares: 0,
                    urgentMessages: 0,
                    averageResponseTime: 0
                });

                setTeamComm([
                    {
                        memberId: 'offline-mode',
                        memberName: '📶 Connect to see team metrics',
                        messagesCount: 0,
                        questionsAsked: 0,
                        questionsAnswered: 0,
                        codeSnippetsShared: 0,
                        lastActiveTime: Date.now(),
                        responseTime: 0
                    }
                ]);

                setTrends(Array.from({ length: 24 }, (_, i) => ({
                    hour: i,
                    messageCount: 0,
                    urgentCount: 0,
                    aiResponseCount: 0
                })));

                setActiveUsers(0);

                console.log(`🔄 [${errorTime}] COMMUNICATIONMETRICS: Set fallback offline mode data`);
            }
        };

        const componentStartTime = new Date().toISOString();
        console.log(`🏗️ [${componentStartTime}] COMMUNICATIONMETRICS: Component useEffect starting`, {
            projectId,
            timeframe,
            component: 'CommunicationMetrics'
        });

        fetchRealData();

        // Set up less frequent refresh for metrics (every 5 minutes)
        // Since communication metrics don't change as rapidly as progress
        console.log(`⏰ [${componentStartTime}] COMMUNICATIONMETRICS: Setting up 5-minute refresh interval`);

        const metricsRefreshInterval = setInterval(() => {
            const refreshTime = new Date().toISOString();

            // Only refresh if the component is still visible
            if (document.visibilityState === 'visible') {
                console.log(`🔄 [${refreshTime}] COMMUNICATIONMETRICS: Executing 5-minute refresh (page visible)`);
                fetchRealData();
            } else {
                console.log(`👁️ [${refreshTime}] COMMUNICATIONMETRICS: Skipping 5-minute refresh (page hidden)`);
            }
        }, 5 * 60 * 1000); // 5 minutes

        return () => {
            const cleanupTime = new Date().toISOString();
            console.log(`🧹 [${cleanupTime}] COMMUNICATIONMETRICS: Component cleanup - clearing refresh interval`);
            clearInterval(metricsRefreshInterval);
        };
    }, [projectId, timeframe]);

    const formatTime = (seconds: number): string => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        return `${Math.floor(seconds / 3600)}h`;
    };

    const getActivityStatus = (lastActiveTime: number): { status: string; color: string } => {
        const minutesAgo = Math.floor((Date.now() - lastActiveTime) / (1000 * 60));
        if (minutesAgo < 5) return { status: 'Active', color: 'bg-green-500' };
        if (minutesAgo < 15) return { status: 'Recent', color: 'bg-yellow-500' };
        if (minutesAgo < 60) return { status: 'Away', color: 'bg-orange-500' };
        return { status: 'Offline', color: 'bg-gray-500' };
    };

    const calculateEngagementScore = (member: TeamCommunication): number => {
        // For new projects, return 0 engagement
        if (member.messagesCount === 0) return 0;

        const responseRatio = member.questionsAnswered / Math.max(member.questionsAsked, 1);
        const activityScore = Math.max(0, 100 - (Date.now() - member.lastActiveTime) / (1000 * 60 * 10)); // Decay over 10 minutes
        const codeShareBonus = member.codeSnippetsShared * 5;
        return Math.min(100, Math.round(responseRatio * 30 + activityScore * 0.5 + codeShareBonus));
    };

    const maxTrendValue = Math.max(...trends.map(t => t.messageCount), 1); // Avoid division by zero

    return (
        <div className="bg-white rounded-lg shadow-sm p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Communication Metrics</h2>
                    <p className="text-gray-600">Team collaboration and AI assistance overview</p>
                </div>

                <div className="flex items-center space-x-2 text-sm">
                    <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-gray-600">Live Tracking</span>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-600">{messageStats.totalMessages}</div>
                    <div className="text-blue-800 text-sm">Total Messages</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">{messageStats.aiResponses}</div>
                    <div className="text-green-800 text-sm">AI Responses</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-600">{messageStats.codeShares}</div>
                    <div className="text-purple-800 text-sm">Code Shares</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-orange-600">{activeUsers}</div>
                    <div className="text-orange-800 text-sm">Active Now</div>
                </div>
            </div>

            {/* Response Time */}
            {messageStats.totalMessages > 0 && (
                <div className="mb-6 bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-700">Average Response Time</div>
                        <div className="text-lg font-bold text-gray-900">
                            {formatTime(messageStats.averageResponseTime)}
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="bg-gray-200 rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all duration-300 ${messageStats.averageResponseTime <= 30 ? 'bg-green-500' :
                                    messageStats.averageResponseTime <= 60 ? 'bg-yellow-500' :
                                        messageStats.averageResponseTime <= 120 ? 'bg-orange-500' : 'bg-red-500'
                                    }`}
                                style={{ width: `${Math.min(100, (120 - messageStats.averageResponseTime) / 120 * 100)}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            )}

            {/* Team Communication */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Activity</h3>
                <div className="space-y-3">
                    {teamComm.map((member) => {
                        const activityStatus = getActivityStatus(member.lastActiveTime);
                        const engagementScore = calculateEngagementScore(member);

                        return (
                            <div key={member.memberId} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-3 h-3 rounded-full ${activityStatus.color}`}></div>
                                    <div>
                                        <div className="font-medium text-gray-900">{member.memberName}</div>
                                        <div className="text-sm text-gray-500">
                                            {activityStatus.status} • {member.messagesCount} messages
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <div>
                                            <div className="font-semibold text-gray-900">{member.questionsAsked}</div>
                                            <div className="text-gray-500 text-xs">Asked</div>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-gray-900">{member.questionsAnswered}</div>
                                            <div className="text-gray-500 text-xs">Answered</div>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-gray-900">{engagementScore}</div>
                                            <div className="text-gray-500 text-xs">Engagement</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Activity Trends */}
            <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">24-Hour Activity Trend</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                    {messageStats.totalMessages > 0 ? (
                        <div className="flex items-end space-x-1 h-32">
                            {trends.map((trend, index) => (
                                <div key={trend.hour} className="flex-1 flex flex-col items-center">
                                    <div
                                        className="bg-blue-500 rounded-t w-full min-h-1 transition-all duration-300"
                                        style={{
                                            height: `${(trend.messageCount / maxTrendValue) * 100}%`
                                        }}
                                    ></div>
                                    {index % 6 === 0 && (
                                        <div className="text-xs text-gray-500 mt-1">{trend.hour}h</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <div className="text-lg mb-2">📊</div>
                            <div className="text-sm">Activity trends will appear as your team starts collaborating</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Tips for New Projects */}
            {messageStats.totalMessages === 0 && (
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">💡 Getting Started</h4>
                    <div className="text-blue-800 text-sm space-y-1">
                        <div>• Start chatting in the AI Chat tab to see communication metrics</div>
                        <div>• Ask questions and share code snippets to increase engagement</div>
                        <div>• Collaborate with team members to see real-time activity</div>
                    </div>
                </div>
            )}
        </div>
    );
};
