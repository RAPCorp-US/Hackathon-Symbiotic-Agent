import { Loader2, UserPlus } from 'lucide-react';
import React, { useState } from 'react';
import { firebaseFunctions } from '../utils/firebaseFunctions';

interface UserRegistrationData {
    name: string;
    skills: string[];
    availableHours: number;
    experience: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    role: 'participant' | 'mentor' | 'organizer';
    email: string;
    password: string;
}

interface UserRegistrationProps {
    onRegistrationComplete: (user: any) => void;
}

export const UserRegistration: React.FC<UserRegistrationProps> = ({ onRegistrationComplete }) => {
    const [isLogin, setIsLogin] = useState(false);
    const [formData, setFormData] = useState<UserRegistrationData>({
        name: '',
        skills: [],
        availableHours: 24,
        experience: 'intermediate',
        role: 'participant',
        email: '',
        password: ''
    });
    const [skillInput, setSkillInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const commonSkills = [
        'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'C++',
        'UI/UX Design', 'Figma', 'Photoshop', 'Machine Learning', 'Data Science',
        'DevOps', 'AWS', 'Docker', 'MongoDB', 'PostgreSQL', 'GraphQL', 'REST APIs',
        'Mobile Development', 'Flutter', 'React Native', 'Swift', 'Kotlin',
        'Project Management', 'Agile', 'Scrum', 'Product Management'
    ];

    const addSkill = (skill: string) => {
        if (skill && !formData.skills.includes(skill)) {
            setFormData(prev => ({
                ...prev,
                skills: [...prev.skills, skill]
            }));
            setSkillInput('');
        }
    };

    const removeSkill = (skillToRemove: string) => {
        setFormData(prev => ({
            ...prev,
            skills: prev.skills.filter(skill => skill !== skillToRemove)
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            if (isLogin) {
                // Login existing user using Firebase Functions
                const result = await firebaseFunctions.loginUser(formData.email, formData.password) as any;

                if (!result.success) {
                    throw new Error(result.message || 'Login failed - check your email and password');
                }

                localStorage.setItem('hackathon_user', JSON.stringify(result.user));
                onRegistrationComplete(result.user);
            } else {
                // Register new user using Firebase Functions
                const result = await firebaseFunctions.registerUser({
                    ...formData,
                    registrationTime: Date.now(),
                    status: 'active'
                }) as any;

                if (!result.success) {
                    throw new Error(result.message || 'Registration failed');
                }

                localStorage.setItem('hackathon_user', JSON.stringify(result.user));
                onRegistrationComplete(result.user);
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-8">
                    <UserPlus className="mx-auto h-12 w-12 text-indigo-600 mb-4" />
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {isLogin ? 'Welcome Back!' : 'Join the Hackathon!'}
                    </h1>
                    <p className="text-gray-600">
                        {isLogin
                            ? 'Login to continue your AI-powered collaboration'
                            : 'Register to get AI-powered task assignments and real-time team coordination'
                        }
                    </p>
                </div>

                {/* Login/Register Toggle */}
                <div className="flex justify-center mb-6">
                    <div className="bg-gray-100 p-1 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setIsLogin(false)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${!isLogin
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Register
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsLogin(true)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isLogin
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Login
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {!isLogin && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Full Name *
                                </label>
                                <input
                                    type="text"
                                    required={!isLogin}
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white"
                                    placeholder="Your full name"
                                />
                            </div>
                        )}

                        <div className={isLogin ? "col-span-2" : ""}>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Email *
                            </label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white"
                                placeholder="your.email@example.com"
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Password *
                        </label>
                        <input
                            type="password"
                            required
                            value={formData.password}
                            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white"
                            placeholder={isLogin ? "Enter your password" : "Create a password"}
                        />
                    </div>

                    {/* Role and Experience */}
                    {!isLogin && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Role
                                </label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as any }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white"
                                >
                                    <option value="participant">Participant</option>
                                    <option value="mentor">Mentor</option>
                                    <option value="organizer">Organizer</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Experience Level
                                </label>
                                <select
                                    value={formData.experience}
                                    onChange={(e) => setFormData(prev => ({ ...prev, experience: e.target.value as any }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white"
                                >
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate">Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                    <option value="expert">Expert</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Available Hours */}
                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Available Hours: {formData.availableHours}h
                            </label>
                            <input
                                type="range"
                                min="4"
                                max="48"
                                value={formData.availableHours}
                                onChange={(e) => setFormData(prev => ({ ...prev, availableHours: parseInt(e.target.value) }))}
                                className="w-full"
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>4h</span>
                                <span>24h</span>
                                <span>48h</span>
                            </div>
                        </div>
                    )}

                    {/* Skills */}
                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Skills & Technologies
                            </label>

                            {/* Add skill input */}
                            <div className="flex gap-2 mb-3">
                                <input
                                    type="text"
                                    value={skillInput}
                                    onChange={(e) => setSkillInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill(skillInput))}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 bg-white"
                                    placeholder="Type a skill and press Enter"
                                />
                                <button
                                    type="button"
                                    onClick={() => addSkill(skillInput)}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                                >
                                    Add
                                </button>
                            </div>

                            {/* Common skills */}
                            <div className="mb-3">
                                <p className="text-xs text-gray-500 mb-2">Quick add common skills:</p>
                                <div className="flex flex-wrap gap-2">
                                    {commonSkills.slice(0, 8).map(skill => (
                                        <button
                                            key={skill}
                                            type="button"
                                            onClick={() => addSkill(skill)}
                                            disabled={formData.skills.includes(skill)}
                                            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {skill}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Selected skills */}
                            <div className="flex flex-wrap gap-2">
                                {formData.skills.map(skill => (
                                    <span
                                        key={skill}
                                        className="inline-flex items-center px-3 py-1 bg-indigo-100 text-indigo-800 text-sm rounded-full"
                                    >
                                        {skill}
                                        <button
                                            type="button"
                                            onClick={() => removeSkill(skill)}
                                            className="ml-2 text-indigo-600 hover:text-indigo-800"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-red-800 text-sm">{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting || !formData.email || !formData.password || (!isLogin && !formData.name)}
                        className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="animate-spin h-4 w-4 mr-2" />
                                {isLogin ? 'Signing In...' : 'Joining Hackathon...'}
                            </>
                        ) : (
                            isLogin ? 'Sign In' : 'Join Hackathon & Start Collaboration!'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
