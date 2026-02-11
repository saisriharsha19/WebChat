import { ReactNode } from 'react';
import { useConnectivity } from '../hooks/useConnectivity';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { ConnectionStatus } from './ConnectionStatus';
import { WifiOff, Download } from 'lucide-react';

interface LayoutProps {
    sidebarContent?: ReactNode;
    children: ReactNode;
    sidebarOpen: boolean;
    onSidebarClose: () => void;
}

export function Layout({ sidebarContent, children, sidebarOpen, onSidebarClose }: LayoutProps) {
    const isOnline = useConnectivity();
    const { isInstallable, promptInstall } = useInstallPrompt();

    return (
        <div className="flex w-full h-full bg-surface-root overflow-hidden relative">

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-[260px] h-full bg-surface-sidebar border-r border-border flex-shrink-0 z-20 relative">
                {sidebarContent}
                {isInstallable && (
                    <div className="p-4 border-t border-border mt-auto">
                        <button
                            onClick={promptInstall}
                            className="flex items-center justify-center w-full gap-2 px-4 py-2 text-sm font-medium text-white transition-colors rounded-md bg-primary hover:bg-primary-hover"
                        >
                            <Download size={16} />
                            Install App
                        </button>
                    </div>
                )}
            </aside>

            {/* Mobile Sidebar (Slide-over) */}
            <div className={`
                md:hidden fixed inset-0 z-50 transform transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                {/* Backdrop */}
                <div
                    className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
                    onClick={onSidebarClose}
                />

                {/* Drawer */}
                <aside className="relative w-[85%] max-w-[300px] h-full bg-surface-sidebar shadow-2xl border-r border-border flex flex-col">
                    {sidebarContent}
                    {isInstallable && (
                        <div className="p-4 border-t border-border mt-auto">
                            <button
                                onClick={promptInstall}
                                className="flex items-center justify-center w-full gap-2 px-4 py-2 text-sm font-medium text-white transition-colors rounded-md bg-primary hover:bg-primary-hover"
                            >
                                <Download size={16} />
                                Install App
                            </button>
                        </div>
                    )}
                </aside>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full min-w-0 relative bg-surface-root">
                {!isOnline && (
                    <div className="bg-red-500/90 backdrop-blur-sm text-white text-xs font-semibold py-1 px-4 text-center z-50 flex items-center justify-center gap-2">
                        <WifiOff size={14} />
                        You are currently offline. Changes will sync when connection is restored.
                    </div>
                )}
                {children}
            </main>

            {/* Connection Status Indicator */}
            <ConnectionStatus />
        </div>
    );
}
