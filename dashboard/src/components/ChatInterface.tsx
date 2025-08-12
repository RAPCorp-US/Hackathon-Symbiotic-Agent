// dashboard/src/components/ChatInterface.tsx
import React, { useEffect, useRef, useState } from 'react';
import { firebaseFunctions } from '../utils/firebaseFunctions';

interface Message {
    id: string;
    userId: string;
    userName: string;
    content: string;
    timestamp: number;
    type: 'user' | 'system' | 'ai';
    priority?: number;
    intent?: string;
    suggestions?: string[];
}

interface ChatInterfaceProps {
    userId: string;
    userName: string;
    projectId?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
    userId,
    userName,
    projectId
}) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isConnected] = useState(true); // Simulated connection for Firebase Functions
    const [isTyping, setIsTyping] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);
    // const [socket, setSocket] = useState<Socket | null>(null); // Disabled for Firebase Functions
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initialize simulated connection (Firebase Functions compatibility)
    useEffect(() => {
        console.log('🚀 CHAT: Chat interface initialized for Firebase Functions');
        console.log('🔍 CHAT: Parameters received:', { userId, userName, projectId });
        setIsLoadingHistory(true);
        setHistoryError(null);

        // Load initial messages from API
        const loadChatHistory = async () => {
            try {
                console.log('📡 CHAT: Loading chat history for userId:', userId, 'projectId:', projectId);
                const data = await firebaseFunctions.getChatHistory(userId, projectId) as any;
                console.log('✅ CHAT: Chat history loaded successfully:', {
                    success: data.success,
                    messagesCount: data.messages?.length || 0,
                    total: data.total,
                    hasMore: data.hasMore,
                    sampleMessage: data.messages?.[0] || null,
                    fullResponse: data
                });

                // Convert backend message format to frontend format if needed
                const formattedMessages = (data.messages || []).map((msg: any) => ({
                    id: msg.id,
                    userId: msg.userId,
                    userName: msg.userName || 'User',
                    content: msg.content, // Backend already returns 'content' field
                    timestamp: msg.timestamp,
                    type: msg.type || 'user'
                }));

                console.log('📝 CHAT: Formatted messages:', formattedMessages);
                setMessages(formattedMessages);
                setHistoryError(null);
            } catch (error) {
                console.error('❌ CHAT: Failed to load chat history:', error);
                setHistoryError('Failed to load chat history. Please refresh the page.');
                setMessages([]); // Set empty messages on error
            } finally {
                setIsLoadingHistory(false);
            }
        };

        loadChatHistory();

        return () => {
            console.log('🧹 CHAT: Chat interface cleanup');
        };
    }, [userId, projectId]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!newMessage.trim()) return;

        const message: Message = {
            id: `msg-${Date.now()}`,
            userId,
            userName,
            content: newMessage.trim(),
            timestamp: Date.now(),
            type: 'user'
        };

        // Add message to local state immediately
        setMessages(prev => [...prev, message]);
        setNewMessage('');

        // Show AI is processing
        setIsTyping(true);

        // Send to backend for AI processing via Firebase Functions
        try {
            console.log('📤 CHAT: Sending message:', newMessage.trim());
            console.log('📤 CHAT: ProjectId being sent:', {
                projectId,
                type: typeof projectId,
                isEmpty: projectId === '',
                isUndefined: projectId === undefined,
                value: projectId
            });
            const data = await firebaseFunctions.sendMessage(userId, newMessage.trim(), projectId) as any;
            console.log('✅ CHAT: Message sent successfully:', data);

            if (data.response) {
                // Add AI response to messages
                setMessages(prev => [...prev, {
                    id: `ai-${Date.now()}`,
                    userId: 'ai',
                    userName: 'Hackathon Agent',
                    content: data.response,
                    timestamp: Date.now(),
                    type: 'ai'
                }]);
            }
        } catch (error) {
            console.error('❌ CHAT: Failed to send message:', error);
            // Add error message to chat
            setMessages(prev => [...prev, {
                id: `error-${Date.now()}`,
                userId: 'system',
                userName: 'System',
                content: 'Failed to send message. Please try again.',
                timestamp: Date.now(),
                type: 'system'
            }]);
        } finally {
            setIsTyping(false);
        }

        inputRef.current?.focus();
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleTyping = () => {
        // Typing indicator disabled for Firebase Functions
        // if (socket && newMessage.length > 0) {
        //     socket.emit('typing', { userId, userName });
        // }
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getMessageIcon = (type: string) => {
        switch (type) {
            case 'ai': return '🤖';
            case 'system': return '📢';
            case 'user': return '👤';
            default: return '💬';
        }
    };

    const getPriorityColor = (priority?: number) => {
        if (!priority) return 'border-gray-200';
        if (priority >= 4) return 'border-red-500 bg-red-50';
        if (priority >= 3) return 'border-orange-500 bg-orange-50';
        return 'border-blue-500 bg-blue-50';
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
                <h2 className="text-lg font-semibold">Hackathon Assistant</h2>
                <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-96">
                {isLoadingHistory ? (
                    <div className="text-center text-gray-500 py-8">
                        <div className="text-4xl mb-2">⏳</div>
                        <p>Loading chat history...</p>
                        <div className="flex justify-center mt-4">
                            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    </div>
                ) : historyError ? (
                    <div className="text-center text-red-500 py-8">
                        <div className="text-4xl mb-2">⚠️</div>
                        <p>{historyError}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                            Refresh Page
                        </button>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                        <div className="text-4xl mb-2">🚀</div>
                        <p>Welcome to your Hackathon Assistant!</p>
                        <p className="text-sm mt-1">Ask me anything about your project, team coordination, or technical questions.</p>
                    </div>
                ) : null}

                {!isLoadingHistory && !historyError && messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex ${message.userId === userId ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg border-2 ${message.userId === userId
                                ? 'bg-blue-600 text-white border-blue-600'
                                : message.type === 'ai'
                                    ? 'bg-purple-100 text-purple-900 border-purple-300'
                                    : message.type === 'system'
                                        ? 'bg-gray-100 text-gray-700 border-gray-300'
                                        : getPriorityColor(message.priority)
                                }`}
                        >
                            {/* Message Header */}
                            {message.userId !== userId && (
                                <div className="flex items-center space-x-1 mb-1">
                                    <span className="text-xs">{getMessageIcon(message.type)}</span>
                                    <span className="text-xs font-medium">{message.userName}</span>
                                    <span className="text-xs opacity-75">{formatTime(message.timestamp)}</span>
                                </div>
                            )}

                            {/* Message Content */}
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                            {/* AI Suggestions */}
                            {message.suggestions && message.suggestions.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    <p className="text-xs font-medium opacity-75">Suggestions:</p>
                                    {message.suggestions.map((suggestion, index) => (
                                        <button
                                            key={index}
                                            onClick={() => setNewMessage(suggestion)}
                                            className="block w-full text-left text-xs bg-white bg-opacity-20 rounded px-2 py-1 hover:bg-opacity-30 transition-colors"
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Message Intent */}
                            {message.intent && (
                                <div className="mt-1">
                                    <span className="text-xs bg-black bg-opacity-20 rounded px-2 py-1">
                                        {message.intent.replace('_', ' ')}
                                    </span>
                                </div>
                            )}

                            {/* Timestamp for user messages */}
                            {message.userId === userId && (
                                <div className="text-xs opacity-75 mt-1 text-right">
                                    {formatTime(message.timestamp)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* Typing Indicator */}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-lg px-4 py-2 border border-gray-300">
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t p-4">
                <div className="flex space-x-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={newMessage}
                        onChange={(e) => {
                            setNewMessage(e.target.value);
                            handleTyping();
                        }}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask your AI assistant anything..."
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={!isConnected}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim() || !isConnected}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Send
                    </button>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2 mt-2">
                    {[
                        "Help me with my code",
                        "Find teammates",
                        "Review our progress",
                        "Plan next steps",
                        "Debug an issue"
                    ].map((quickAction) => (
                        <button
                            key={quickAction}
                            onClick={() => setNewMessage(quickAction)}
                            className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
                        >
                            {quickAction}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
