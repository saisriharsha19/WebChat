import { AuthProvider, useAuth } from './AuthContext.tsx';
import { WebSocketProvider } from './WebSocketContext.tsx';
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

    return (
        <div className="h-full w-full">
            <WebSocketProvider>
                <Dashboard />
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
