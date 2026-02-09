import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useWebSocket } from '../WebSocketContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import ChatRoom from './ChatRoom';
import { RoomList } from './RoomList';
import { CreateGroupModal } from './CreateGroupModal';
import { Layout } from './Layout';
import { EmptyState } from './EmptyState';
import { FriendManager } from './FriendManager';
import { VoiceCallModal } from './VoiceCallModal';
import { fetchWithAuth, API_ENDPOINTS } from '../lib/api';

export default function Dashboard() {
    const { user, logout } = useAuth();
    const { connectionStatus } = useWebSocket();
    const { isSubscribed, subscribeToPush, permission } = usePushNotifications();
    const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showDirectory, setShowDirectory] = useState(false);

    // Mobile sidebar state
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    const SidebarContent = (
        <>
            {/* Header */}
            <div className="h-[48px] px-4 flex items-center justify-between border-b border-border hover:bg-surface-hover transition-colors cursor-pointer shrink-0">
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
                        setMobileSidebarOpen(false); // Close sidebar on mobile select
                    }}
                    onNewDM={() => setShowDirectory(true)}
                    onNewGroup={() => setShowCreateGroup(true)}
                />
            </div>

            {/* User Profile */}
            <div className="p-3 border-t border-border bg-surface-sidebar shrink-0">
                <div className="flex items-center gap-2.5 p-1.5 rounded-[4px] transition-colors">
                    <div className="relative">
                        <div className="w-6 h-6 rounded-[4px] bg-accent flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                            {user?.username?.[0].toUpperCase()}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-surface-sidebar rounded-full flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium leading-tight truncate text-txt-secondary">
                            {user?.display_name || user?.username}
                        </div>
                        <div className="text-[11px] text-txt-tertiary truncate">Online</div>
                    </div>
                    {/* Always visible logout button for touch devices */}
                    <button
                        onClick={logout}
                        className="p-2 hover:bg-surface-hover rounded text-txt-tertiary hover:text-red-400 transition-all touch-target"
                        title="Logout"
                        aria-label="Logout"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    </button>
                </div>
            </div>

            {permission === 'default' && !isSubscribed && (
                <div className="px-3 pb-3 bg-surface-sidebar border-t border-transparent">
                    <button
                        onClick={subscribeToPush}
                        className="w-full py-2 px-3 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                        Enable Notifications
                    </button>
                </div>
            )}
        </>
    );

    return (
        <Layout
            sidebarContent={SidebarContent}
            sidebarOpen={mobileSidebarOpen}
            onSidebarClose={() => setMobileSidebarOpen(false)}
        >
            {connectionStatus !== 'connected' && (
                <div className={`w-full px-4 py-1 text-xs text-center font-medium ${connectionStatus === 'disconnected' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'
                    }`}>
                    {connectionStatus === 'disconnected' ? 'Disconnected' : 'Reconnecting...'}
                </div>
            )}
            <VoiceCallModal />

            {/* Mobile Header (Only visible on mobile when room is selected or standard view) */}
            {!currentRoomId && (
                <div className="md:hidden h-[48px] px-4 flex items-center border-b border-border bg-surface-sidebar">
                    <button onClick={() => setMobileSidebarOpen(true)} className="mr-3 text-txt-secondary">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    </button>
                    <span className="font-semibold text-txt-primary">Messages</span>
                </div>
            )}

            {currentRoomId ? (
                <ChatRoom
                    roomId={currentRoomId}
                    onBack={() => {
                        setCurrentRoomId(null)
                    }}
                />
            ) : (
                <EmptyState
                    icon={
                        <svg className="text-accent" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    }
                    heading="Welcome to Entropy"
                    description="Your secure, offline-first workspace. Select a conversation to start chatting or connect with your team."
                    actions={
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                            <button
                                onClick={() => setShowDirectory(true)}
                                className="flex flex-col items-center p-4 bg-surface-sidebar hover:bg-surface-hover border border-border rounded-xl transition-all group text-left hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent mb-3 group-hover:bg-accent group-hover:text-white transition-colors">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                </div>
                                <span className="text-sm font-semibold text-txt-primary">Find Friends</span>
                                <span className="text-xs text-txt-tertiary mt-1">Search directory & connect</span>
                            </button>

                            <button
                                onClick={() => setShowCreateGroup(true)}
                                className="flex flex-col items-center p-4 bg-surface-sidebar hover:bg-surface-hover border border-border rounded-xl transition-all group text-left hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 mb-3 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                                </div>
                                <span className="text-sm font-semibold text-txt-primary">Create Group</span>
                                <span className="text-xs text-txt-tertiary mt-1">Start a new project team</span>
                            </button>
                        </div>
                    }
                />
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

            {showDirectory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowDirectory(false)}>
                    <div className="bg-surface-sidebar rounded-xl border border-border shadow-2xl overflow-hidden h-[600px] w-full max-w-md flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                            <h2 className="text-txt-primary font-semibold text-sm">Friends & Directory</h2>
                            <button
                                onClick={() => setShowDirectory(false)}
                                className="text-txt-tertiary hover:text-txt-primary transition-colors p-1 rounded hover:bg-surface-hover"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <FriendManager
                            onSelectUser={async (uid) => {
                                // Start DM
                                try {
                                    const room = await fetchWithAuth(API_ENDPOINTS.createDM(uid), { method: 'POST' });
                                    setCurrentRoomId(room.id);
                                    setShowDirectory(false);
                                    setMobileSidebarOpen(false);
                                } catch (e) {
                                    console.error("Failed to create DM", e);
                                    alert("Could not start conversation");
                                }
                            }}
                        />
                    </div>
                </div>
            )}
        </Layout>
    );
}
