import { ReactNode } from 'react';

interface LayoutProps {
    sidebarContent?: ReactNode;
    children: ReactNode;
    sidebarOpen: boolean;
    onSidebarClose: () => void;
}

export function Layout({ sidebarContent, children, sidebarOpen, onSidebarClose }: LayoutProps) {
    return (
        <div className="flex w-full h-full bg-surface-root overflow-hidden relative">

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-[280px] h-full bg-surface-sidebar border-r border-border flex-shrink-0 z-20">
                {sidebarContent}
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
                </aside>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-full min-w-0 relative bg-surface-root">
                {children}
            </main>
        </div>
    );
}
