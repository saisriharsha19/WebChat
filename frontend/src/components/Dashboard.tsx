import { useState } from 'react';
import { useAuth } from '../AuthContext';
import ChatRoom from './ChatRoom';
import { RoomList } from './RoomList';
import { UserList } from './UserList';
import { CreateGroupModal } from './CreateGroupModal';

export default function Dashboard() {
    const { user, logout } = useAuth();
    const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

    return (
        <div className="fixed inset-0 w-full h-full flex bg-surface-root text-txt-primary overflow-hidden font-sans antialiased">

            {/* --- LEFT SIDEBAR (Navigation) --- */}
            <div className={`
                flex flex-col flex-shrink-0 z-20 bg-surface-sidebar border-r border-border
                absolute inset-0 md:static md:w-[260px] md:h-full transition-transform duration-300
                ${currentRoomId ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}
            `}>
                {/* Header */}
                <div className="h-[48px] px-4 flex items-center justify-between border-b border-border hover:bg-surface-hover transition-colors cursor-pointer">
                    <div className="font-semibold text-[14px] truncate text-txt-primary">
                        {user?.display_name || user?.username}'s Workspace
                    </div>
                </div>

                {/* Room List */}
                <div className="flex-1 overflow-y-auto saas-scrollbar">
                    <RoomList
                        currentRoomId={currentRoomId}
                        onSelectRoom={(id) => {
                            setCurrentRoomId(id);
                        }}
                        onNewDM={() => setRightSidebarOpen(true)}
                        onNewGroup={() => setShowCreateGroup(true)}
                    />
                </div>

                {/* User Profile */}
                <div className="p-3 border-t border-border bg-surface-sidebar">
                    <div className="flex items-center gap-2.5 p-1.5 rounded-[4px] hover:bg-surface-hover cursor-pointer transition-colors group">
                        <div className="relative">
                            <div className="w-6 h-6 rounded-[4px] bg-gradient-to-tr from-accent to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                                {user?.username?.[0].toUpperCase()}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-surface-sidebar rounded-full flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium leading-tight truncate text-txt-secondary group-hover:text-txt-primary">
                                {user?.display_name || user?.username}
                            </div>
                            <div className="text-[11px] text-txt-tertiary truncate">Online</div>
                        </div>
                        <button onClick={logout} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-txt-tertiary transition-all" title="Logout">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* --- MIDDLE: MAIN CHAT AREA --- */}
            <div className={`
                flex-1 flex flex-col bg-surface-root min-w-0
                absolute inset-0 md:static md:h-full transition-transform duration-300
                ${currentRoomId ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
            `}>
                {currentRoomId ? (
                    <ChatRoom
                        roomId={currentRoomId}
                        onBack={() => setCurrentRoomId(null)}
                        onToggleDirectory={() => setRightSidebarOpen(!rightSidebarOpen)}
                    />
                ) : (
                    <div className="hidden md:flex flex-1 flex-col items-center justify-center text-txt-tertiary">
                        <div className="w-16 h-16 rounded-[12px] bg-surface border border-border flex items-center justify-center mb-4">
                            <svg className="text-txt-secondary" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        </div>
                        <h3 className="text-[14px] font-medium text-txt-primary">No conversation selected</h3>
                        <p className="text-[13px] mt-1">Choose a channel or DM from the sidebar.</p>
                    </div>
                )}
            </div>

            {/* --- RIGHT SIDEBAR: DIRECTORY --- */}
            {rightSidebarOpen && (
                <div className="absolute right-0 top-0 bottom-0 w-[280px] bg-[#0f1013] border-l border-border flex flex-col z-40 shadow-2xl">
                    <div className="h-[48px] px-4 flex items-center justify-between border-b border-border">
                        <span className="text-[12px] font-semibold uppercase tracking-wider text-txt-secondary">Directory</span>
                        <button onClick={() => setRightSidebarOpen(false)} className="text-txt-tertiary hover:text-txt-primary">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3">
                        <UserList
                            onSelectUser={async (uid) => {
                                try {
                                    const { fetchWithAuth, API_ENDPOINTS } = await import('../lib/api');
                                    const room = await fetchWithAuth(API_ENDPOINTS.createDM(uid), { method: 'POST' });
                                    setCurrentRoomId(room.id);
                                    setRightSidebarOpen(false);
                                } catch (e) {
                                    console.error("Failed to create DM", e);
                                    alert("Could not start conversation");
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Modals */}
            {showCreateGroup && (
                <CreateGroupModal
                    onClose={() => setShowCreateGroup(false)}
                    onCreated={(newRoom) => {
                        setCurrentRoomId(newRoom.id);
                    }}
                />
            )}
        </div>
    );
}
