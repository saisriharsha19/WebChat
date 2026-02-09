import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../WebSocketContext';
import { useCall } from '../CallContext';
import { useAuth } from '../AuthContext';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileUploader } from './FileUploader';
import { fetchWithAuth, API_ENDPOINTS, API_URL } from '../lib/api';

import { getRoomName } from '../lib/roomUtils';

interface ChatRoomProps {
    roomId: string;
    onBack?: () => void;
}

export default function ChatRoom({ roomId, onBack }: ChatRoomProps) {
    const { sendMessage, joinRoom, isConnected, lastUpdate, markAsRead } = useWebSocket();
    const { startCall } = useCall();
    const { user } = useAuth();
    const [inputValue, setInputValue] = useState('');
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
    const groupMenuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (groupMenuRef.current && !groupMenuRef.current.contains(event.target as Node)) {
                setIsGroupMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

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

    // Read Receipt Observer
    const observer = useRef<IntersectionObserver | null>(null);
    useEffect(() => {
        if (!messages) return;

        // Disconnect previous
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const msgId = entry.target.getAttribute('data-msg-id');
                    const senderId = entry.target.getAttribute('data-sender-id');

                    // Only mark read if it's not my message
                    if (msgId && senderId && senderId !== user?.id) {
                        // Find the message object to check if already read
                        const msg = messages.find(m => m.id === msgId);
                        const alreadyRead = msg?.read_receipts?.some((r: any) => r.user_id === user?.id);

                        if (!alreadyRead) {
                            markAsRead(msgId, roomId);
                        }

                        // Stop observing this one to save resources
                        observer.current?.unobserve(entry.target);
                    }
                }
            });
        }, {
            root: null, // viewport
            threshold: 0.1 // Trigger when even slightly visible (10%) for "instant" feel
        });

        // Observe all unread messages from others
        document.querySelectorAll('.message-item').forEach((el) => {
            const senderId = el.getAttribute('data-sender-id');
            if (senderId && senderId !== user?.id) {
                observer.current?.observe(el);
            }
        });

        return () => {
            if (observer.current) observer.current.disconnect();
        };
    }, [messages, markAsRead, roomId, user?.id]);


    const handleSend = async () => {
        if (!inputValue.trim()) return;

        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(10);

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
            });
        } else {
            const content = inputValue.trim();
            setInputValue(''); // Clear input immediately for speed

            // Optimistic update
            try {
                // Generate a correlation ID to deduplicate/link the message
                const tempId = `temp-${Date.now()}-${Math.random()}`;

                // Now send via network (context handles local DB add)
                await sendMessage(roomId, content, tempId);

            } catch (err) {
                console.error("Failed to send message:", err);
                alert("Failed to send message");
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
                        className="md:hidden p-3 -ml-2 text-txt-secondary hover:text-txt-primary hover:bg-white/5 rounded-full transition-colors active:scale-95"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#6366f1] flex items-center justify-center text-white font-bold text-sm shadow-inner">
                            #
                        </div>
                        <div>
                            <div className="font-semibold text-[15px] leading-tight">
                                {getRoomName(roomDetails, user?.id) || `Room ${roomId}`}
                            </div>
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
                                }
                            }}
                            className="p-3 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded-full transition-all active:scale-95"
                            title="Start Voice Call"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        </button>
                    )}

                    {roomDetails?.type === 'group' && (
                        <div className="relative" ref={groupMenuRef}>
                            <button
                                onClick={() => setIsGroupMenuOpen(!isGroupMenuOpen)}
                                className={`p-3 rounded-full transition-all active:scale-95 ${isGroupMenuOpen ? 'text-txt-primary bg-surface-hover' : 'text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover'}`}
                                title="Group Options"
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                            </button>

                            {isGroupMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-surface-hover border border-white/10 rounded-xl shadow-xl backdrop-blur-xl animate-fade-in z-50 overflow-hidden">
                                    <div className="p-1">
                                        <button
                                            onClick={async () => {
                                                setIsGroupMenuOpen(false);
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

                                        {roomDetails.created_by === user?.id && (
                                            <button
                                                onClick={async () => {
                                                    setIsGroupMenuOpen(false);
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
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Messages Area - Added top padding for header */}
            <div className="flex-1 overflow-y-auto saas-scrollbar flex flex-col px-4 pt-[70px] pb-4 space-y-6 scroll-smooth">
                <div className="flex-1" />

                {messages?.map((msg, i) => {
                    const isOwn = msg.sender_id === user?.id;
                    const prevMsg = messages[i - 1];
                    const isSequence = prevMsg && prevMsg.sender_id === msg.sender_id &&
                        (msg.created_at.getTime() - prevMsg.created_at.getTime() < 300000); // 5 mins grouping

                    return (
                        <div key={msg.id || msg.temp_id}>
                            {/* Date Separator */}
                            {(() => {
                                const currentDate = new Date(msg.created_at);
                                const prevDate = i > 0 ? new Date(messages[i - 1].created_at) : null;
                                const showDateSeparator = !prevDate ||
                                    currentDate.getDate() !== prevDate.getDate() ||
                                    currentDate.getMonth() !== prevDate.getMonth() ||
                                    currentDate.getFullYear() !== prevDate.getFullYear();

                                if (showDateSeparator) {
                                    const today = new Date();
                                    const yesterday = new Date(today);
                                    yesterday.setDate(yesterday.getDate() - 1);

                                    let dateLabel = currentDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
                                    if (currentDate.toDateString() === today.toDateString()) {
                                        dateLabel = "Today";
                                    } else if (currentDate.toDateString() === yesterday.toDateString()) {
                                        dateLabel = "Yesterday";
                                    }

                                    return (
                                        <div className="flex justify-center my-6 sticky top-[70px] z-10 pointer-events-none">
                                            <div className="bg-surface-hover/90 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-semibold text-txt-secondary border border-white/10 shadow-md">
                                                {dateLabel}
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            <div
                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${!isSequence ? 'mt-4' : 'mt-1'} group animate-fade-in message-item`}
                                data-msg-id={msg.id}
                                data-sender-id={msg.sender_id}
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
                                                <div className="flex items-center">
                                                    {msg.read_receipts && msg.read_receipts.some((r: any) => r.user_id !== user?.id) ? (
                                                        // Read by someone (Blue Double Check)
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></svg>
                                                    ) : msg.status === 'synced' ? (
                                                        // Delivered (Grey Double Check) - using lighter white/80 due to dark bg
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><path d="M18 6L7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></svg>
                                                    ) : (
                                                        // Sent/Pending (Single Check)
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60"><polyline points="20 6 9 17 4 12" /></svg>
                                                    )}
                                                </div>
                                            )}

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
                        className="w-full bg-transparent border-none text-base text-txt-primary px-4 py-3 pb-10 focus:ring-0 focus:outline-none rounded-2xl resize-none min-h-[56px] max-h-[160px] leading-relaxed placeholder:text-txt-tertiary"
                        rows={1}
                    />

                    {/* Toolbar inside input */}
                    <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="hover:bg-white/5 p-2 rounded-full transition-colors">
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
                            className="p-3 bg-accent text-white rounded-xl disabled:opacity-50 disabled:grayscale hover:bg-accent-hover active:scale-95 transition-all shadow-md shadow-accent/20"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
