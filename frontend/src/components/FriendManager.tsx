import { useState, useEffect } from 'react';
import { fetchWithAuth, API_ENDPOINTS } from '../lib/api';
import { UserWithStatus, FriendRequest } from '../types';
import { useWebSocket } from '../WebSocketContext';

interface FriendManagerProps {
    onSelectUser: (userId: number) => void;
    selectedUserIds?: number[];
}

export function FriendManager({ onSelectUser, selectedUserIds = [] }: FriendManagerProps) {
    const { onlineUsers, startCall } = useWebSocket();
    const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends');

    // Data states
    const [friends, setFriends] = useState<UserWithStatus[]>([]);
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const [searchResults, setSearchResults] = useState<UserWithStatus[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Poll for updates (temporary until full WS events are handling lists)
    // Ideally we listen to WS events to update these lists
    useEffect(() => {
        if (activeTab === 'friends') loadFriends();
        if (activeTab === 'requests') loadRequests();
    }, [activeTab]);

    const loadFriends = async () => {
        try {
            const data = await fetchWithAuth(API_ENDPOINTS.getFriends);
            setFriends(data);
        } catch (err) {
            console.error(err);
        }
    };

    const loadRequests = async () => {
        try {
            const received = await fetchWithAuth(API_ENDPOINTS.getFriendRequestsReceived);
            // const sent = await fetchWithAuth(API_ENDPOINTS.getFriendRequestsSent);
            // Combine or just show received for now? Show received primarily.
            // Let's just state locally.
            setRequests(received);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 1) {
            setSearchResults([]);
            return;
        }
        try {
            const results = await fetchWithAuth(API_ENDPOINTS.searchUsers(query));
            setSearchResults(results);
        } catch (err) {
            console.error(err);
        }
    };

    const sendRequest = async (userId: number) => {
        try {
            await fetchWithAuth(API_ENDPOINTS.sendFriendRequest(userId), { method: 'POST' });
            // Update local state to show 'pending'
            setSearchResults(prev => prev.map(u =>
                u.id === userId ? { ...u, friendship_status: 'pending_sent' } : u
            ));
        } catch (err) {
            alert("Failed to send request");
        }
    };

    const acceptRequest = async (requestId: number) => {
        try {
            await fetchWithAuth(API_ENDPOINTS.respondFriendRequest(requestId, 'accept'), { method: 'PUT' });
            loadRequests();
        } catch (err) {
            console.error(err);
        }
    };

    const rejectRequest = async (requestId: number) => {
        try {
            await fetchWithAuth(API_ENDPOINTS.respondFriendRequest(requestId, 'reject'), { method: 'PUT' });
            loadRequests();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="flex flex-col h-full bg-surface-sidebar w-full">
            {/* Tabs */}
            <div className="px-4 pt-4 pb-2 border-b border-border flex gap-6 shrink-0">
                <button
                    onClick={() => setActiveTab('friends')}
                    className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'friends' ? 'border-accent text-txt-primary' : 'border-transparent text-txt-tertiary hover:text-txt-secondary'}`}
                >
                    Friends
                </button>
                <button
                    onClick={() => setActiveTab('requests')}
                    className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'requests' ? 'border-accent text-txt-primary' : 'border-transparent text-txt-tertiary hover:text-txt-secondary'}`}
                >
                    Requests
                    {requests.length > 0 && (
                        <span className="flex items-center justify-center bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem]">
                            {requests.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('search')}
                    className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'search' ? 'border-accent text-txt-primary' : 'border-transparent text-txt-tertiary hover:text-txt-secondary'}`}
                >
                    Add Friend
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto saas-scrollbar p-4">
                {activeTab === 'friends' && (
                    <div className="space-y-1">
                        {friends.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-txt-tertiary">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                </svg>
                                <p className="text-sm">No friends yet</p>
                            </div>
                        )}
                        {friends.map(friend => {
                            const isOnline = onlineUsers.has(friend.id);
                            return (
                                <div key={friend.id} className="flex items-center gap-3 p-2 hover:bg-surface-hover rounded-lg group transition-colors cursor-pointer" onClick={() => onSelectUser(friend.id)}>
                                    <div className="relative shrink-0">
                                        <div className="w-10 h-10 bg-surface-hover rounded-lg flex items-center justify-center font-semibold text-txt-secondary border border-border">
                                            {friend.display_name?.[0].toUpperCase() || friend.username[0].toUpperCase()}
                                        </div>
                                        {isOnline && (
                                            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-surface-sidebar rounded-full flex items-center justify-center">
                                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-txt-primary truncate">{friend.display_name || friend.username}</div>
                                        <div className="text-xs text-txt-tertiary truncate">
                                            {isOnline ? 'Online' : (friend.last_seen ? 'Last seen ' + new Date(friend.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Offline')}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); startCall(friend.id); }}
                                        className="p-2 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded-md opacity-0 group-hover:opacity-100 transition-all"
                                        title="Start Voice Call"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                        </svg>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeTab === 'requests' && (
                    <div className="space-y-3">
                        {requests.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-txt-tertiary">
                                <p className="text-sm">No pending requests</p>
                            </div>
                        )}
                        {requests.map(req => (
                            <div key={req.id} className="p-3 bg-surface-hover/50 border border-border rounded-lg flex items-center justify-between">
                                <div className="text-sm font-medium text-txt-primary">
                                    <span className="text-txt-secondary text-xs block mb-0.5">Incoming Request</span>
                                    User #{req.sender_id}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => acceptRequest(req.id)}
                                        className="p-1.5 bg-accent/10 text-accent hover:bg-accent/20 rounded-md transition-colors"
                                        title="Accept"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </button>
                                    <button
                                        onClick={() => rejectRequest(req.id)}
                                        className="p-1.5 bg-surface-hover text-txt-tertiary hover:text-red-400 hover:bg-surface-hover/80 rounded-md transition-colors"
                                        title="Reject"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'search' && (
                    <div>
                        <div className="relative mb-4">
                            <input
                                type="text"
                                placeholder="Search by username..."
                                className="w-full bg-surface-hover border border-border text-txt-primary text-sm rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-accent transition-colors placeholder:text-txt-tertiary"
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                autoFocus
                            />
                            <svg className="absolute left-3 top-2.5 text-txt-tertiary" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                        </div>

                        <div className="space-y-1">
                            {searchResults.map(u => (
                                <div key={u.id} className="flex items-center justify-between p-2 hover:bg-surface-hover rounded-lg group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-surface-hover border border-border rounded-lg flex items-center justify-center text-xs font-medium text-txt-secondary">
                                            {u.username[0].toUpperCase()}
                                        </div>
                                        <div className="text-sm font-medium text-txt-primary">{u.username}</div>
                                    </div>

                                    {u.friendship_status === 'none' && (
                                        <button
                                            onClick={() => sendRequest(u.id)}
                                            className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-md hover:bg-accent-hover transition-colors"
                                        >
                                            Add Friend
                                        </button>
                                    )}
                                    {u.friendship_status === 'friend' && (
                                        <span className="flex items-center gap-1.5 text-xs text-green-500 font-medium px-2 py-1 bg-green-500/10 rounded-md">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            Friend
                                        </span>
                                    )}
                                    {u.friendship_status === 'pending_sent' && (
                                        <span className="text-xs text-txt-tertiary px-2 py-1 bg-surface-hover rounded-md border border-border">Request Sent</span>
                                    )}
                                    {u.friendship_status === 'pending_received' && (
                                        <span className="text-xs text-accent px-2 py-1 bg-accent/10 rounded-md">Expected Action</span>
                                    )}
                                </div>
                            ))}
                            {searchQuery && searchResults.length === 0 && (
                                <div className="text-center text-txt-tertiary py-8 text-sm">No users found</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
