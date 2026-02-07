import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../WebSocketContext';
import { useAuth } from '../AuthContext';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileUploader } from './FileUploader';
import { fetchWithAuth, API_ENDPOINTS, API_URL } from '../lib/api';

interface ChatRoomProps {
    roomId: number;
    onBack?: () => void;
}

export default function ChatRoom({ roomId, onBack }: ChatRoomProps) {
    const { sendMessage, joinRoom, isConnected, lastUpdate, startCall } = useWebSocket();
    const { user } = useAuth();
    const [inputValue, setInputValue] = useState('');
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Live query for room details to get type and members
    const roomDetails = useLiveQuery(
        () => db.rooms.get(roomId),
        [roomId]
    );

    // Fetch room details if missing (for call button)
    useEffect(() => {
        if (!roomDetails && roomId) {
            fetchWithAuth(API_ENDPOINTS.getRoom(roomId))
                .then(async (room) => {
                    await db.rooms.put(room);
                })
                .catch(err => console.error("Failed to fetch room details:", err));
        }
    }, [roomId, roomDetails]);

    // Live query from IndexedDB
    const messages = useLiveQuery(
        () =>
            db.messages
                .where('room_id')
                .equals(roomId)
                .sortBy('created_at'),
        [roomId, lastUpdate]
    );

    useEffect(() => {
        joinRoom(roomId);
    }, [roomId, joinRoom]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, [messages?.length, roomId]);

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        if (editingMessageId) {
            const content = inputValue.trim();
            // Optimistic update for edit
            try {
                const existing = await db.messages.get(editingMessageId);
                if (existing) {
                    await db.messages.put({
                        ...existing,
                        content: content,
                        is_edited: true,
                        // Don't change updated_at yet, let server dictate authoritative time or set local
                        updated_at: new Date()
                    });
                }
            } catch (e) {
                console.error("Optimistic edit failed", e);
            }

            setEditingMessageId(null);
            setInputValue('');

            fetchWithAuth(API_ENDPOINTS.editMessage(editingMessageId), {
                method: 'PUT',
                body: JSON.stringify({ content: content })
            }).then(() => {
                // Success, server broadcast will come later and confirm (or overwrite with same data)
            }).catch(async (err) => {
                console.error("Edit failed:", err);
                alert("Edit failed");
                // Revert optimistic update? 
                // Too complex for now, user will just see it revert if they refresh or if server sends error?
                // Ideally we revert here.
            });
        } else {
            const content = inputValue.trim();
            setInputValue(''); // Clear input immediately for speed

            // Optimistic update
            try {
                // Add to local DB immediately with 'pending' status
                // The sendMessage function in WebSocketContext handles `db.messages.add`
                // BUT, to be "instant", we should ensure it happens without waiting for the network socket if possible

                const tempId = `temp-${Date.now()}-${Math.random()}`;

                await db.messages.add({
                    content,
                    sender_id: user!.id,
                    room_id: roomId,
                    message_type: 'text',
                    created_at: new Date(),
                    updated_at: new Date(),
                    is_deleted: false,
                    status: 'pending',
                    temp_id: tempId,
                    attachments: [],
                    // Mock sender for display using actual user auth data
                    sender: {
                        id: user!.id,
                        username: user!.username,
                        display_name: user!.display_name,
                        avatar_url: user!.avatar_url,
                        email: user!.email || '',
                        theme_preference: user!.theme_preference || 'light',
                        is_active: true,
                        created_at: new Date(),
                        last_seen: new Date()
                    }
                });

                // Now send via network
                // Generate a correlation ID to deduplicate/link the message
                const correlationId = tempId;
                sendMessage(roomId, content, correlationId);

            } catch (err) {
                console.error("Failed to optimistically add message:", err);
            }
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    return (
        <div className="flex flex-col h-full bg-surface-root text-txt-primary w-full relative">
            {/* Header - Glass Effect */}
            <div className="absolute top-0 left-0 right-0 h-[60px] px-4 flex items-center justify-between border-b border-white/5 bg-surface-root/80 backdrop-blur-md z-20 shrink-0 shadow-sm transition-all">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack} // This will just clear room on desktop too if used there, but dashboard handles hiding it
                        className="md:hidden p-2 -ml-2 text-txt-secondary hover:text-txt-primary hover:bg-white/5 rounded-full transition-colors active:scale-95"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#6366f1] flex items-center justify-center text-white font-bold text-sm shadow-inner">
                            #
                        </div>
                        <div>
                            <div className="font-semibold text-[15px] leading-tight">Room {roomId}</div>
                            <div className="text-[11px] text-txt-tertiary flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]' : 'bg-red-500'}`} />
                                {isConnected ? 'Online' : 'Connecting...'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-2">
                    {roomDetails?.type === 'direct' && (
                        <button
                            onClick={() => {
                                const otherMember = roomDetails.members?.find((m: any) => m.user_id !== user?.id);
                                if (otherMember) {
                                    startCall(otherMember.user_id);
                                } else {
                                    // Fallback if members not synced or found
                                    console.warn("Could not find other member to call");
                                    // Maybe fallback to fetching room info??
                                }
                            }}
                            className="p-2 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded-full transition-all active:scale-95"
                            title="Start Voice Call"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        </button>
                    )}

                    {roomDetails?.type === 'group' && (
                        <div className="relative group/menu">
                            <button
                                className="p-2 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded-full transition-all active:scale-95"
                                title="Group Options"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                            </button>

                            <div className="absolute right-0 top-full mt-2 w-48 bg-surface-hover border border-white/10 rounded-xl shadow-xl backdrop-blur-xl invisible opacity-0 translate-y-2 group-hover/menu:visible group-hover/menu:opacity-100 group-hover/menu:translate-y-0 transition-all duration-200 z-50 overflow-hidden">
                                <div className="p-1">
                                    <button
                                        onClick={async () => {
                                            if (confirm("Are you sure you want to leave this group?")) {
                                                try {
                                                    await fetchWithAuth(API_ENDPOINTS.leaveRoom(roomId), { method: 'POST' });
                                                    await db.rooms.delete(roomId); // Remove locally
                                                    if (onBack) onBack();
                                                } catch (err) {
                                                    console.error("Failed to leave room", err);
                                                    alert("Failed to leave room");
                                                }
                                            }
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-txt-secondary hover:text-txt-primary hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                        Leave Group
                                    </button>

                                    {Number(roomDetails.created_by) === Number(user?.id) && (
                                        <button
                                            onClick={async () => {
                                                if (confirm("Are you sure you want to delete this group? This cannot be undone.")) {
                                                    try {
                                                        await fetchWithAuth(API_ENDPOINTS.deleteRoom(roomId), { method: 'DELETE' });
                                                        await db.rooms.delete(roomId); // Remove locally
                                                        if (onBack) onBack();
                                                    } catch (err) {
                                                        console.error("Failed to delete room", err);
                                                        alert("Failed to delete room");
                                                    }
                                                }
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2 mt-1"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                            Delete Group
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Messages Area - Added top padding for header */}
            <div className="flex-1 overflow-y-auto saas-scrollbar flex flex-col px-4 pt-[70px] pb-4 space-y-6 scroll-smooth">
                <div className="flex-1" />

                {messages?.map((msg, i) => {
                    const isOwn = Number(msg.sender_id) === Number(user?.id);
                    const prevMsg = messages[i - 1];
                    const isSequence = prevMsg && Number(prevMsg.sender_id) === Number(msg.sender_id) &&
                        (msg.created_at.getTime() - prevMsg.created_at.getTime() < 300000); // 5 mins grouping

                    return (
                        <div
                            key={msg.id || msg.temp_id}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${!isSequence ? 'mt-4' : 'mt-1'} group animate-fade-in`}
                        >
                            {!isOwn && !isSequence && (
                                <div className="w-8 h-8 rounded-full bg-surface-hover border border-white/5 flex items-center justify-center text-xs font-semibold text-txt-secondary mr-2 mt-0.5 shadow-sm transform transition-transform group-hover:scale-105">
                                    {msg.sender?.username?.[0] || 'U'}
                                </div>
                            )}
                            {!isOwn && isSequence && <div className="w-10 mr-0" />}

                            <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                                {!isSequence && !isOwn && (
                                    <span className="text-[11px] font-medium text-txt-secondary mb-1 ml-1 select-none">
                                        {msg.sender?.display_name || msg.sender?.username}
                                    </span>
                                )}

                                <div className={`
                                    relative px-3.5 py-2 text-[14.5px] shadow-sm transition-all duration-200
                                    ${isOwn
                                        ? 'bg-[#6366f1] text-white rounded-2xl rounded-tr-sm border border-transparent shadow-[0_2px_8px_rgba(99,102,241,0.25)]'
                                        : 'bg-surface-hover/80 backdrop-blur-sm border border-white/5 text-txt-primary rounded-2xl rounded-tl-sm hover:border-white/10'}
                                `}>
                                    <div className="break-words whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                                    {/* Attachments */}
                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className="mt-2 space-y-1.5">
                                            {msg.attachments.map((file: any) => (
                                                <a
                                                    key={file.id}
                                                    href={`${API_URL}/media/${file.filename}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${isOwn
                                                        ? 'bg-black/20 hover:bg-black/30 text-white border border-white/10'
                                                        : 'bg-black/20 hover:bg-black/30 text-txt-primary border border-white/5 hover:border-white/20'
                                                        }`}
                                                >
                                                    <div className="p-2 bg-white/10 rounded-lg">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path></svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-left">
                                                        <div className="text-xs font-semibold truncate max-w-[180px]">{file.filename}</div>
                                                        <div className="text-[10px] opacity-70 mt-0.5">{Math.round(file.file_size / 1024)} KB</div>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}

                                    <div className={`text-[10px] mt-1 text-right ${isOwn ? 'text-white/60' : 'text-txt-tertiary'} flex items-center justify-end gap-1.5`}>
                                        <span className="opacity-80">{formatTime(msg.created_at)}</span>
                                        {msg.is_edited && <span className="italic opacity-60">(edited)</span>}

                                        {isOwn && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingMessageId(msg.id || null);
                                                    setInputValue(msg.content);
                                                }}
                                                className="md:opacity-0 md:group-hover:opacity-100 opacity-100 transition-opacity p-0.5 hover:text-white hover:bg-white/20 rounded text-white/70"
                                                title="Edit"
                                            >
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} className="h-2" />
            </div>

            {/* Input Area - Mobile Optimized */}
            <div className="p-3 md:p-5 bg-surface-root/95 backdrop-blur-xl border-t border-white/5 z-20 shrink-0 sticky bottom-0 safe-pb-2">
                <div className="relative bg-surface-sidebar border border-white/10 rounded-2xl shadow-sm focus-within:border-accent/50 focus-within:shadow-[0_0_0_2px_rgba(94,106,210,0.2)] focus-within:bg-surface-hover/50 transition-all duration-200">
                    <textarea
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={`Message #${roomId}`}
                        className="w-full bg-transparent border-none text-[15px] text-txt-primary px-4 py-3 pb-10 focus:ring-0 focus:outline-none rounded-2xl resize-none min-h-[56px] max-h-[160px] leading-relaxed placeholder:text-txt-tertiary"
                        rows={1}
                    />

                    {/* Toolbar inside input */}
                    <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="hover:bg-white/5 p-1.5 rounded-full transition-colors">
                                <FileUploader roomId={roomId} onUploadComplete={() => { }} />
                            </div>
                            <div className="text-[10px] text-txt-tertiary pointer-events-none select-none">
                                {editingMessageId ? (
                                    <span className="text-accent font-medium animate-pulse">Editing...</span>
                                ) : (
                                    <span className="hidden md:inline">Enter to send</span>
                                )}
                            </div>
                            {editingMessageId && (
                                <button
                                    onClick={() => {
                                        setEditingMessageId(null);
                                        setInputValue('');
                                    }}
                                    className="text-[10px] text-red-400 hover:text-red-300 px-2 py-0.5 bg-red-500/10 rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>

                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim()}
                            className="p-2 bg-accent text-white rounded-xl disabled:opacity-50 disabled:grayscale hover:bg-accent-hover active:scale-95 transition-all shadow-md shadow-accent/20"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
