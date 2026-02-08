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
    const { subscribeToPush, isSubscribed } = usePushNotifications(); // Moved to top level

    // Check for DB Reset / System Mismatch / Version Update
    useEffect(() => {
        const checkSystem = async () => {
            // ... existing checkSystem logic (omitted for brevity in replacement, but needs to be there)
            // I shouldn't omit it if I'm replacing the whole function block.
            // Wait, replace_file_content replaces a chunk.
            // I should be careful not to delete checkSystem logic if I don't provide it.
            // The user instruction said "Move usePushNotifications...".
            // It's safer to rewrite the whole function body or use multi_replace if I can target specific parts.
            // But the structure changes significantly (logic flow).
            // Let's rewrite the return logic.
            try {
                // 1. Check Version Match
                const storedVersion = localStorage.getItem('app_version');
                const currentVersion = __APP_VERSION__;

                if (storedVersion !== currentVersion) {
                    console.warn(`Version mismatch (Stored: ${storedVersion}, Current: ${currentVersion}). Resetting cache...`);
                    await db.delete();
                    await db.open();
                    localStorage.clear();
                    localStorage.setItem('app_version', currentVersion);
                    window.location.reload();
                    return;
                }

                // 2. Check System Instance (Backend Reset)
                const res = await fetch(API_ENDPOINTS.systemInfo);
                if (res.ok) {
                    const data = await res.json();
                    const serverId = data.instance_id;
                    const localId = localStorage.getItem('sys_instance_id');

                    if (serverId && localId && serverId !== localId) {
                        console.warn("System Reset Detected! Wiping local data...");
                        await db.delete();
                        await db.open();
                        localStorage.clear();
                        localStorage.setItem('sys_instance_id', serverId);
                        localStorage.setItem('app_version', currentVersion);
                        window.location.reload();
                    } else if (serverId && !localId) {
                        localStorage.setItem('sys_instance_id', serverId);
                    }
                }
            } catch (err) {
                console.error("Failed to check system info", err);
            }
        };

        checkSystem();
    }, []);

    useEffect(() => {
        if (user && !isSubscribed) {
            subscribeToPush();
        }
    }, [user, subscribeToPush, isSubscribed]);

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

import { ReloadPrompt } from './components/ReloadPrompt';

function App() {
    return (
        <div className="w-full h-full overflow-hidden">
            <AuthProvider>
                <AppContent />
                <ReloadPrompt />
            </AuthProvider>
        </div>
    );
}

export default App;
