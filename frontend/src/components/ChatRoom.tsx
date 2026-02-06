import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../WebSocketContext';
import { useAuth } from '../AuthContext';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileUploader } from './FileUploader';
import { fetchWithAuth, API_ENDPOINTS, API_URL } from '../lib/api';

interface ChatRoomProps {
    roomId: number;
    onBack?: () => void;
    onToggleDirectory?: () => void;
}

export default function ChatRoom({ roomId, onBack, onToggleDirectory }: ChatRoomProps) {
    const { sendMessage, joinRoom, isConnected, lastUpdate } = useWebSocket();
    const { user } = useAuth();
    const [inputValue, setInputValue] = useState('');
    const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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

    const handleSend = () => {
        if (!inputValue.trim()) return;

        if (editingMessageId) {
            fetchWithAuth(API_ENDPOINTS.editMessage(editingMessageId), {
                method: 'PUT',
                body: JSON.stringify({ content: inputValue })
            }).then(() => {
                setEditingMessageId(null);
                setInputValue('');
            }).catch(err => alert('Edit failed'));
        } else {
            sendMessage(roomId, inputValue.trim());
            setInputValue('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    return (
        <div className="flex flex-col h-full bg-surface-root text-txt-primary">
            {/* Header */}
            <div className="h-[48px] px-4 flex items-center justify-between border-b border-border bg-surface-root z-10 shrink-0">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="md:hidden p-1.5 -ml-2 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded-full transition-colors"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
                        </button>
                    )}
                    <div className="flex items-center gap-2">
                        <span className="text-txt-tertiary">#</span>
                        <span className="font-semibold text-[14px]">Room {roomId}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
                    {onToggleDirectory && (
                        <button
                            onClick={onToggleDirectory}
                            className="text-txt-tertiary hover:text-txt-primary p-2 hover:bg-surface-hover rounded"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto saas-scrollbar flex flex-col px-4 py-4 space-y-4">
                <div className="flex-1" />

                {messages?.map((msg, i) => {
                    const isOwn = Number(msg.sender_id) === Number(user?.id);
                    const prevMsg = messages[i - 1];
                    const isSequence = prevMsg && Number(prevMsg.sender_id) === Number(msg.sender_id) &&
                        (msg.created_at.getTime() - prevMsg.created_at.getTime() < 120000);

                    return (
                        <div
                            key={msg.id || msg.temp_id}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${!isSequence ? 'mt-2' : 'mt-0.5'}`}
                        >
                            {!isOwn && (
                                <div className={`w-8 h-8 rounded-[4px] bg-accent/20 flex items-center justify-center text-xs font-bold text-accent mr-3 mt-1 flex-shrink-0 ${isSequence ? 'invisible' : ''}`}>
                                    {msg.sender?.username?.[0] || 'U'}
                                </div>
                            )}

                            <div className={`flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                                {!isSequence && !isOwn && (
                                    <span className="text-[11px] text-txt-tertiary mb-1 ml-0.5">
                                        {msg.sender?.display_name || msg.sender?.username}
                                    </span>
                                )}

                                <div className={`
                                    relative px-3 py-2 text-[14px] shadow-sm
                                    ${isOwn
                                        ? 'bg-accent text-white rounded-l-lg rounded-tr-lg rounded-br-sm'
                                        : 'bg-surface border border-border text-txt-primary rounded-r-lg rounded-tl-lg rounded-bl-sm'}
                                `}>
                                    <div className="break-words whitespace-pre-wrap">{msg.content}</div>

                                    {/* Attachments */}
                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                            {msg.attachments.map((file: any) => (
                                                <a
                                                    key={file.id}
                                                    href={`${API_URL}/media/${file.filename}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${isOwn
                                                        ? 'bg-white/10 hover:bg-white/20'
                                                        : 'bg-surface-hover/50 border border-border/50 hover:bg-surface-hover'
                                                        }`}
                                                >
                                                    <div className="p-1.5 bg-black/10 rounded">
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path></svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-left">
                                                        <div className="text-xs font-medium truncate max-w-[200px] md:max-w-[300px]" title={file.filename}>{file.filename}</div>
                                                        <div className={`text-[10px] ${isOwn ? 'text-white/70' : 'text-txt-tertiary'}`}>{Math.round(file.file_size / 1024)} KB</div>
                                                    </div>
                                                    <div className={`p-1.5 opacity-70 ${isOwn ? 'text-white' : 'text-txt-primary'}`}>
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    )}

                                    <div className={`text-[10px] mt-1 text-right ${isOwn ? 'text-white/60' : 'text-txt-tertiary'} flex items-center justify-end gap-2`}>
                                        <span>{formatTime(msg.created_at)}</span>
                                        {msg.is_edited && <span>(edited)</span>}

                                        {/* Edit Icon - Always visible for own messages */}
                                        {isOwn && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingMessageId(msg.id);
                                                    setInputValue(msg.content);
                                                }}
                                                className="opacity-70 hover:opacity-100 transition-opacity p-0.5"
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
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="px-4 py-4">
                <div className="bg-surface border border-border rounded-[8px] shadow-sm focus-within:border-accent focus-within:shadow-md transition-all">
                    <div className="flex items-center gap-1 p-1 border-b border-border/50 bg-surface-sidebar rounded-t-[8px]">
                        <FileUploader roomId={roomId} onUploadComplete={() => { }} />
                    </div>
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
                        className="w-full bg-transparent border-none text-[14px] text-txt-primary px-3 py-2.5 focus:ring-0 resize-none min-h-[44px] max-h-[200px]"
                        rows={1}
                    />
                    <div className="flex items-center justify-between px-2 pb-2">
                        <div className="text-[10px] text-txt-tertiary">
                            {editingMessageId ? 'Editing message (Esc to cancel)' : 'Return to send, Shift+Return for new line'}
                        </div>
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim()}
                            className="p-1.5 bg-accent text-white rounded-[4px] disabled:opacity-50 hover:bg-accent-hover transition-colors"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
