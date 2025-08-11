// User Registration and Authentication Integration
import { useEffect, useState } from 'react';
import { firebaseFunctions } from '../utils/firebaseFunctions';

interface UserRegistrationData {
    name: string;
    skills: string[];
    availableHours: number;
    experience: string;
    role: 'participant' | 'mentor' | 'organizer';
}

export const useUserRegistration = () => {
    const [isRegistered, setIsRegistered] = useState(false);
    const [user, setUser] = useState(null);

    const registerUser = async (userData: UserRegistrationData) => {
        try {
            // Connect to Firebase Functions
            const result = await firebaseFunctions.registerUser(userData) as any;

            if (!result.success) {
                throw new Error(result.message || 'Registration failed');
            }

            setUser(result.user);
            setIsRegistered(true);

            // This triggers the roadmap update in your backend
            return result;
        } catch (error) {
            console.error('Registration failed:', error);
            throw error;
        }
    };

    return { isRegistered, user, registerUser };
};

export const useRoadmapData = (projectId: string, userId: string) => {
    const [roadmap, setRoadmap] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRoadmap = async () => {
            try {
                // Connect to Firebase Functions
                const data = await firebaseFunctions.getRoadmap(projectId) as any;
                setRoadmap(data);
                setIsLoading(false);
            } catch (error) {
                console.error('Failed to fetch roadmap:', error);
                setIsLoading(false);
            }
        };

        fetchRoadmap();
    }, [projectId, userId]);

    return { roadmap, isLoading };
};
