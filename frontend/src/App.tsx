import { useEffect } from 'react';
import { AuthProvider, useAuth } from './AuthContext.tsx';
import { WebSocketProvider } from './WebSocketContext.tsx';
import { CallProvider } from './CallContext.tsx';
import { usePushNotifications } from './hooks/usePushNotifications';
import LoginPage from './components/LoginPage.tsx';
import Dashboard from './components/Dashboard.tsx';
import './style.css';

function AppContent() {
    const { user, isLoading } = useAuth();

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
