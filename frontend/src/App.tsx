import { useEffect } from 'react';
import { AuthProvider, useAuth } from './AuthContext.tsx';
import { WebSocketProvider } from './WebSocketContext.tsx';
import { CallProvider } from './CallContext.tsx';
import { usePushNotifications } from './hooks/usePushNotifications';
import LoginPage from './components/LoginPage.tsx';
import Dashboard from './components/Dashboard.tsx';
import { API_ENDPOINTS } from './lib/api';
import { db } from './lib/db';
import './style.css';

function AppContent() {
    const { user, isLoading } = useAuth();

    // Check for DB Reset / System Mismatch
    useEffect(() => {
        const checkSystem = async () => {
            try {
                const res = await fetch(API_ENDPOINTS.systemInfo);
                if (res.ok) {
                    const data = await res.json();
                    const serverId = data.instance_id;
                    const localId = localStorage.getItem('sys_instance_id');

                    if (serverId && localId && serverId !== localId) {
                        console.warn("System Reset Detected! Wiping local data...");
                        await db.delete();
                        await db.open();
                        localStorage.clear(); // Clear all tokens/settings
                        localStorage.setItem('sys_instance_id', serverId);
                        window.location.reload();
                    } else if (serverId && !localId) {
                        // First run or valid
                        localStorage.setItem('sys_instance_id', serverId);
                    }
                }
            } catch (err) {
                console.error("Failed to check system info", err);
            }
        };

        checkSystem();
    }, []);

    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-surface-root">
                {/* Minimal Spinner */}
                <div className="w-6 h-6 border-2 border-border-strong border-t-accent rounded-full animate-spin mb-3"></div>
                <div className="text-txt-tertiary text-[13px] font-medium tracking-wide">INITIALIZING...</div>
            </div>
        );
    }

    if (!user) {
        return <LoginPage />;
    }

    const { subscribeToPush } = usePushNotifications();

    useEffect(() => {
        if (user) {
            subscribeToPush();
        }
    }, [user, subscribeToPush]);

    return (
        <div className="h-full w-full">
            <WebSocketProvider>
                <CallProvider>
                    <Dashboard />
                </CallProvider>
            </WebSocketProvider>
        </div>
    );
}

function App() {
    return (
        <div className="w-full h-full overflow-hidden">
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </div>
    );
}

export default App;
