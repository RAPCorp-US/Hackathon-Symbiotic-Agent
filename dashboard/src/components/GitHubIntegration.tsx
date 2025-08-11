// dashboard/src/components/GitHubIntegration.tsx
import { AlertCircle, CheckCircle, Github, Key, Link, Lock } from 'lucide-react';
import React, { useState } from 'react';
import { firebaseFunctions } from '../utils/firebaseFunctions';

interface GitHubIntegrationProps {
    onRepoLinked: (repoData: any) => void;
}

export const GitHubIntegration: React.FC<GitHubIntegrationProps> = ({ onRepoLinked }) => {
    const [repoUrl, setRepoUrl] = useState('');
    const [githubToken, setGithubToken] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'repo' | 'token' | 'verify'>('repo');

    const handleRepoSubmit = () => {
        // Extract repo info from URL
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            setError('Invalid GitHub URL format');
            return;
        }

        setError(null);
        setStep('token');
    };

    const handleConnect = async () => {
        setIsConnecting(true);
        setError(null);

        try {
            // Extract repo info from URL
            const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (!match) {
                throw new Error('Invalid GitHub URL format');
            }

            const [, owner, repo] = match;
            const cleanRepo = repo.replace('.git', '');

            // Verify GitHub token and repo access using Firebase Functions
            const verifyResult = await firebaseFunctions.verifyGitHub(githubToken) as any;

            if (!verifyResult.success) {
                throw new Error(verifyResult.error || 'Failed to verify GitHub access');
            }

            setIsConnected(true);
            onRepoLinked({
                owner,
                repo: cleanRepo,
                url: repoUrl,
                isPrivate: verifyResult.isPrivate || false,
                permissions: verifyResult.permissions || {},
                lastCommit: verifyResult.lastCommit || null
            });

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect');
        } finally {
            setIsConnecting(false);
        }
    };

    if (isConnected) {
        return (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <h3 className="font-medium text-green-800">GitHub Repository Connected</h3>
                </div>
                <p className="text-sm text-green-600 mt-1">{repoUrl}</p>
                <p className="text-xs text-green-500 mt-1">✓ Private repository access verified</p>
            </div>
        );
    }

    return (
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6">
            <div className="text-center">
                <Github className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Connect Your GitHub Repository
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                    Link your project repository to track real progress, commits, and generate accurate AI insights
                </p>

                {step === 'repo' && (
                    <div className="max-w-md mx-auto">
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Repository URL
                            </label>
                            <input
                                type="text"
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                placeholder="https://github.com/owner/repo"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <button
                            onClick={handleRepoSubmit}
                            disabled={!repoUrl}
                            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next: Setup Access
                        </button>
                    </div>
                )}

                {step === 'token' && (
                    <div className="max-w-md mx-auto">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                            <div className="flex items-center space-x-2 mb-2">
                                <Lock className="h-4 w-4 text-amber-600" />
                                <h4 className="font-medium text-amber-800">Private Repository Access</h4>
                            </div>
                            <p className="text-sm text-amber-700">
                                To access your private repository, we need a GitHub Personal Access Token.
                            </p>
                        </div>

                        <div className="text-left space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    GitHub Personal Access Token
                                </label>
                                <input
                                    type="password"
                                    value={githubToken}
                                    onChange={(e) => setGithubToken(e.target.value)}
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <h5 className="font-medium text-blue-900 mb-2">How to create a token:</h5>
                                <ol className="text-sm text-blue-800 space-y-1">
                                    <li>1. Go to GitHub Settings → Developer settings → Personal access tokens</li>
                                    <li>2. Click "Generate new token" → "Fine-grained personal access token"</li>
                                    <li>3. Select your repository</li>
                                    <li>4. Grant permissions: Contents (Read), Metadata (Read), Pull requests (Read)</li>
                                    <li>5. Copy the token and paste it above</li>
                                </ol>
                                <a
                                    href="https://github.com/settings/tokens?type=beta"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 mt-2"
                                >
                                    <Key className="h-4 w-4" />
                                    <span>Create Token on GitHub</span>
                                </a>
                            </div>

                            <div className="flex space-x-2">
                                <button
                                    onClick={() => setStep('repo')}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleConnect}
                                    disabled={!githubToken || isConnecting}
                                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1"
                                >
                                    {isConnecting ? (
                                        <>
                                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                            <span>Verifying...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Link className="h-4 w-4" />
                                            <span>Connect Repository</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mt-4 flex items-center justify-center space-x-2 text-red-600">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                <div className="mt-6 text-xs text-gray-500">
                    <p><strong>What happens when you connect:</strong></p>
                    <ul className="mt-2 space-y-1 text-left max-w-md mx-auto">
                        <li>• Track real commits and code changes</li>
                        <li>• Generate accurate progress reports</li>
                        <li>• AI analyzes your actual codebase</li>
                        <li>• Smart task recommendations based on your code</li>
                        <li>• Your token is encrypted and stored securely</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
