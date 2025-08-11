import { useEffect, useState } from 'react';
import { AuthForm } from './components/AuthForm';
import { ChatInterface } from './components/ChatInterface';
import { CommunicationMetrics } from './components/CommunicationMetrics';
import { ConnectionStatus } from './components/ConnectionStatus';
import { GitHubIntegration } from './components/GitHubIntegration';
import { ProgressMap } from './components/ProgressMap';
import { ProjectSelection } from './components/ProjectSelection';
import { ProjectSetup } from './components/ProjectSetup';
import { firebaseFunctions } from './utils/firebaseFunctions';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'participant' | 'mentor' | 'organizer';
    skills: string[];
    availableHours: number;
    experience: string;
    status: string;
}

interface ProjectData {
    name: string;
    description: string;
    deadline: string;
    techStack: string[];
    goals: Array<{
        id: string;
        title: string;
        description: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
    }>;
}

interface GitHubRepo {
    owner: string;
    repo: string;
    url: string;
}

function App() {
    const [activeTab, setActiveTab] = useState<'chat' | 'progress' | 'metrics'>('chat');
    const [user, setUser] = useState<User | null>(null);
    const [project, setProject] = useState<ProjectData | null>(null);
    const [githubRepo, setGithubRepo] = useState<GitHubRepo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [projectId, setProjectId] = useState<string>('');

    useEffect(() => {
        // Check if user is already registered
        const checkExistingUser = async () => {
            try {
                const savedUser = localStorage.getItem('hackathon_user');
                const savedProject = localStorage.getItem('hackathon_project');
                const savedRepo = localStorage.getItem('hackathon_github_repo');

                if (savedUser) {
                    const userData = JSON.parse(savedUser);

                    // Verify user still exists in backend using Firebase Functions
                    try {
                        const result = await firebaseFunctions.getUser(userData.id) as any;
                        setUser(result.user);

                        // Try to fetch project using Firebase Functions
                        try {
                            const projectResult = await firebaseFunctions.getProject(userData.id) as any;
                            if (projectResult.success && projectResult.project) {
                                setProject(projectResult.project);
                                setProjectId(projectResult.project.id); // Use actual project ID from backend
                                console.log('✅ Loaded project from backend:', projectResult.project.id);
                                localStorage.setItem('hackathon_project', JSON.stringify(projectResult.project));
                            } else {
                                console.log('⚠️ No project found in backend for user');
                                // If no project exists, we'll set the project ID when a project is created
                            }
                        } catch (projectError) {
                            console.log('❌ Error loading project from backend:', projectError);
                        }

                        // Fallback to localStorage project data if backend fetch failed
                        if (!project && savedProject) {
                            const localProject = JSON.parse(savedProject);
                            setProject(localProject);
                            // Try to use the project ID from local storage if it exists
                            if (localProject.id) {
                                setProjectId(localProject.id);
                                console.log('📱 Using project ID from localStorage:', localProject.id);
                            }
                        }

                        // Load GitHub repo if exists  
                        if (savedRepo) {
                            setGithubRepo(JSON.parse(savedRepo));
                        }
                    } catch (userError) {
                        // User no longer exists, clear local storage
                        localStorage.removeItem('hackathon_user');
                        localStorage.removeItem('hackathon_project');
                        localStorage.removeItem('hackathon_github_repo');
                    }
                }
            } catch (error) {
                console.error('Error checking user:', error);
                // If backend is not available, show demo mode
                localStorage.removeItem('hackathon_user');
                localStorage.removeItem('hackathon_project');
                localStorage.removeItem('hackathon_github_repo');
            } finally {
                setIsLoading(false);
            }
        };

        checkExistingUser();
    }, []);

    const handleRegistrationComplete = (newUser: User) => {
        setUser(newUser);
        // Don't set a hardcoded project ID here - wait for project to be created
        console.log('👤 User created, waiting for project setup to set project ID');
    };

    const handleProjectSetup = async (projectData: ProjectData) => {
        if (user) {
            try {
                // Save project to backend using Firebase Functions
                const result = await firebaseFunctions.createProject(user.id, projectData) as any;
                if (result.success) {
                    setProjectId(result.projectId);
                }
            } catch (error) {
                console.error('Error saving project to backend:', error);
            }
        }

        // Also save to localStorage as backup
        setProject(projectData);
        localStorage.setItem('hackathon_project', JSON.stringify(projectData));
    };

    const handleGitHubConnection = (repoData: GitHubRepo) => {
        setGithubRepo(repoData);
        localStorage.setItem('hackathon_github_repo', JSON.stringify(repoData));
    };

    const handleSignOut = () => {
        localStorage.removeItem('hackathon_user');
        localStorage.removeItem('hackathon_project');
        localStorage.removeItem('hackathon_github_repo');
        setUser(null);
        setProject(null);
        setGithubRepo(null);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Connecting to AI Coordination System...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <AuthForm onAuthComplete={handleRegistrationComplete} />;
    }

    // Show project selection/creation based on user role
    if (!project) {
        // Organizers can create projects, others select from existing projects
        if (user.role === 'organizer') {
            return (
                <div className="min-h-screen bg-gray-100 p-4">
                    <ProjectSetup onSetupComplete={handleProjectSetup} />
                </div>
            );
        } else {
            // Participants and mentors select from available projects
            return (
                <ProjectSelection
                    user={user}
                    onProjectSelected={(selectedProject) => {
                        console.log('🎯 Project selected:', selectedProject);
                        setProject(selectedProject);
                        setProjectId(selectedProject.id);
                        localStorage.setItem('hackathon_project', JSON.stringify(selectedProject));
                    }}
                    onCreateProject={() => {
                        // This allows mentors to also create projects if needed
                        // You can remove this if only organizers should create projects
                        console.log('🎯 User chose to create project');
                    }}
                />
            );
        }
    }

    // Show GitHub integration if no repo connected
    if (!githubRepo) {
        return (
            <div className="min-h-screen bg-gray-100 p-4">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">
                            Welcome, {user.name}! 🎉
                        </h2>
                        <p className="text-gray-600 mb-4">
                            Your project "{project.name}" is set up. Now let's connect your GitHub repository to track real progress.
                        </p>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="font-medium text-blue-900 mb-2">Project Overview</h3>
                            <p className="text-blue-800 text-sm">{project.description}</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                                {project.techStack.map(tech => (
                                    <span key={tech} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                        {tech}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <GitHubIntegration onRepoLinked={handleGitHubConnection} />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center space-x-4">
                            <h1 className="text-2xl font-bold text-gray-900">
                                🚀 {project?.name || 'Hackathon Dashboard'}
                            </h1>
                            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500">
                                <span>•</span>
                                <span>Project: {projectId}</span>
                                {githubRepo && (
                                    <>
                                        <span>•</span>
                                        <span className="text-blue-600">
                                            {githubRepo.owner}/{githubRepo.repo}
                                        </span>
                                    </>
                                )}
                                <span>•</span>
                                <ConnectionStatus />
                            </div>
                        </div>

                        <div className="flex items-center space-x-4">
                            <div className="text-sm text-gray-600">
                                Welcome, <span className="font-medium">{user.name}</span>
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${user.role === 'participant' ? 'bg-blue-100 text-blue-800' :
                                user.role === 'mentor' ? 'bg-green-100 text-green-800' :
                                    'bg-purple-100 text-purple-800'
                                }`}>
                                {user.role}
                            </div>
                            <button
                                onClick={handleSignOut}
                                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded-md hover:bg-gray-100"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation Tabs */}
            <nav className="bg-white border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex space-x-8">
                        {[
                            { id: 'chat', label: '💬 AI Chat', desc: 'Real-time team communication' },
                            { id: 'progress', label: '📊 Progress', desc: 'Project timeline & milestones' },
                            { id: 'metrics', label: '📈 Metrics', desc: 'Team collaboration analytics' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                <div className="flex flex-col items-center space-y-1">
                                    <span>{tab.label}</span>
                                    <span className="text-xs text-gray-400 hidden md:block">{tab.desc}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="animate-slide-in">
                    {activeTab === 'chat' && (
                        <ChatInterface
                            userId={user.id}
                            userName={user.name}
                            projectId={projectId}
                        />
                    )}

                    {activeTab === 'progress' && (
                        <ProgressMap
                            projectId={projectId}
                            userId={user.id}
                        />
                    )}

                    {activeTab === 'metrics' && (
                        <CommunicationMetrics
                            projectId={projectId}
                            timeframe="6h"
                        />
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center text-sm text-gray-500">
                        <div>
                            Hackathon Coordination System • Powered by AI Agents
                        </div>
                        <div className="flex items-center space-x-4">
                            <span className="flex items-center space-x-1">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <span>System Operational</span>
                            </span>
                            <span>•</span>
                            <span>Last sync: {new Date().toLocaleTimeString()}</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default App
