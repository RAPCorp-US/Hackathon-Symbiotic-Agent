import { AlertTriangle, Wifi } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { firebaseFunctions } from '../utils/firebaseFunctions';

interface ConnectionStatusProps {
    className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ className = '' }) => {
    const [isConnected, setIsConnected] = useState<boolean | null>(null);

    useEffect(() => {
        const checkConnection = async () => {
            try {
                // Test connection using Firebase Functions
                await firebaseFunctions.getUsers();
                setIsConnected(true);
            } catch (error) {
                setIsConnected(false);
            }
        };

        // Check immediately
        checkConnection();

        // Check every 30 seconds
        const interval = setInterval(checkConnection, 30000);

        return () => clearInterval(interval);
    }, []);

    if (isConnected === null) {
        return (
            <div className={`flex items-center space-x-2 text-gray-500 ${className}`}>
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
                <span className="text-sm">Checking connection...</span>
            </div>
        );
    }

    if (isConnected) {
        return (
            <div className={`flex items-center space-x-2 text-green-600 ${className}`}>
                <Wifi className="h-4 w-4" />
                <span className="text-sm font-medium">Live Data</span>
            </div>
        );
    }

    return (
        <div className={`flex items-center space-x-2 text-amber-600 ${className}`}>
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Demo Mode</span>
            <span className="text-xs text-gray-500">- Backend offline</span>
        </div>
    );
};
