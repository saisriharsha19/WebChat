import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext.tsx';
import { API_ENDPOINTS, fetchWithAuth } from './lib/api.ts';
import { db } from './lib/db.ts';

type WSMessage = {
    type: string;
    [key: string]: any;
};

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface WebSocketContextType {
    sendMessage: (roomId: string, content: string, correlationId?: string) => Promise<void>;
    joinRoom: (roomId: string) => void;
    leaveRoom: (roomId: string) => void;
    markAsRead: (messageId: string, roomId: string) => void;
    isConnected: boolean;
    connectionStatus: ConnectionStatus;
    lastUpdate: number;
    lastFriendUpdate: number;
    onlineUsers: Map<string, string>;

    // Signaling for other contexts (like CallContext)
    sendSignal: (message: any) => void;
    registerSignalHandler: (handler: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { token, user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [lastUpdate, setLastUpdate] = useState(0);
    const [lastFriendUpdate, setLastFriendUpdate] = useState(0);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const pingIntervalRef = useRef<number | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<Map<string, string>>(new Map());

    // Signal handlers registry
    const signalHandlersRef = useRef<Set<(data: any) => void>>(new Set());

    const registerSignalHandler = useCallback((handler: (data: any) => void) => {
        signalHandlersRef.current.add(handler);
        return () => {
            signalHandlersRef.current.delete(handler);
        };
    }, []);

    const sendSignal = useCallback((message: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        } else {
            console.warn("Cannot send signal, WebSocket not open", message);
        }
    }, []);

    const syncMessages = async () => {
        try {
            // 1. Get offline messages (pending)
            const offlineMessages = await db.messages.where('status').equals('pending').toArray();

            // 2. Get last sync time (latest message created_at in DB that is synced)
            const lastSyncedMessage = await db.messages
                .where('status').equals('synced')
                .reverse() // Newest first
                .sortBy('created_at');

            const lastSyncTime = lastSyncedMessage.length > 0 ? lastSyncedMessage[0].created_at : null;

            // 3. Prepare payload
            const payload = {
                last_sync_time: lastSyncTime ? lastSyncTime.toISOString() : null,
                messages: offlineMessages.map(msg => ({
                    content: msg.content,
                    room_id: msg.room_id,
                    message_type: msg.message_type,
                    client_timestamp: msg.created_at.toISOString(),
                    temp_id: msg.temp_id
                }))
            };

            // 4. Call sync endpoint
            const response = await fetchWithAuth(API_ENDPOINTS.sync, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            // 5. Update local DB with result
            await db.transaction('rw', db.messages, async () => {
                // Process newly synced messages (our own messages that were pending)
                // The server returns them with their real IDs and timestamps
                if (response.synced_messages) {
                    for (const msg of response.synced_messages) {
                        await db.messages.put({
                            id: msg.id,
                            content: msg.content,
                            sender_id: msg.sender_id,
                            room_id: msg.room_id,
                            message_type: msg.message_type || 'text',
                            created_at: new Date(msg.created_at),
                            updated_at: new Date(msg.created_at),
                            is_deleted: false,
                            status: 'synced',
                            attachments: msg.attachments || [],
                            read_receipts: msg.read_receipts || []
                        });
                    }
                }

                // Process new messages from others
                for (const msg of response.new_messages) {
                    await db.messages.put({
                        id: msg.id,
                        content: msg.content,
                        sender_id: msg.sender_id,
                        room_id: msg.room_id,
                        message_type: msg.message_type || 'text',
                        created_at: new Date(msg.created_at),
                        updated_at: new Date(msg.created_at),
                        is_deleted: false,
                        status: 'synced',
                        attachments: msg.attachments || [],
                        read_receipts: msg.read_receipts || []
                    });
                }

                // Clean up pending that were synced
                if (offlineMessages.length > 0) {
                    const tempIds = offlineMessages.map(m => m.temp_id).filter(id => id !== undefined);
                    if (tempIds.length > 0) {
                        await db.messages.where('temp_id').anyOf(tempIds).delete();
                    }
                }
            });

            setLastUpdate(Date.now());
            console.log("Sync completed");

        } catch (err) {
            console.error("Sync failed:", err);
        }
    };

    // Throttled Sync Implementation
    const lastSyncTriggerRef = useRef<number>(0);
    const syncTimeoutRef = useRef<number | null>(null);

    const throttledSync = useCallback(() => {
        const now = Date.now();
        const timeSinceLastSync = now - lastSyncTriggerRef.current;
        const THROTTLE_MS = 2000; // 2 seconds throttle

        if (timeSinceLastSync >= THROTTLE_MS) {
            lastSyncTriggerRef.current = now;
            syncMessages();
        } else {
            // Schedule it for later if not already scheduled
            if (!syncTimeoutRef.current) {
                syncTimeoutRef.current = window.setTimeout(() => {
                    lastSyncTriggerRef.current = Date.now();
                    syncMessages();
                    syncTimeoutRef.current = null;
                }, THROTTLE_MS - timeSinceLastSync);
            }
        }
    }, []);

    // Periodic Sync (Every 60 seconds) to ensure freshness even if idle
    useEffect(() => {
        const intervalId = setInterval(() => {
            if (token && user && (wsRef.current?.readyState === WebSocket.OPEN || document.visibilityState === 'visible')) {
                console.log("Periodic background sync...");
                syncMessages();
            }
        }, 60000); // 60 seconds

        return () => clearInterval(intervalId);
    }, [token, user]);

    const connect = () => {
        if (!token) return;
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            setConnectionStatus(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');
            const ws = new WebSocket(API_ENDPOINTS.wsChat(token));
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('WebSocket connected');
                setConnectionStatus('connected');
                reconnectAttemptsRef.current = 0;

                // Trigger sync on connection
                syncMessages();

                if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = window.setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 30000);
            };

            ws.onmessage = async (event) => {
                try {
                    const data: WSMessage = JSON.parse(event.data);

                    if (data.type === 'message' || data.type === 'new_message') {
                        // Trigger throttled sync to ensure we catch up on any missing context
                        throttledSync();

                        // Handle chat messages
                        const msg = data.message || data;
                        const correlationId = data.correlation_id;

                        await db.transaction('rw', db.messages, async () => {
                            if (correlationId) {
                                const pending = await db.messages.where('temp_id').equals(correlationId).first();
                                if (pending) {
                                    await db.messages.delete(pending.id!);
                                }
                            }

                            await db.messages.put({
                                id: msg.id,
                                content: msg.content,
                                sender_id: msg.sender_id,
                                room_id: msg.room_id,
                                message_type: msg.message_type || 'text',
                                created_at: new Date(msg.created_at),
                                updated_at: new Date(msg.created_at),
                                is_deleted: false,
                                status: 'synced',
                                attachments: msg.attachments || [],
                                read_receipts: msg.read_receipts || []
                            });
                        });
                        setLastUpdate(Date.now());
                    } else if (['call_offer', 'call_answer', 'call_reject', 'call_ended', 'ice_candidate', 'call_rejected', 'call_handled'].includes(data.type)) {
                        // Dispatch to signal handlers (CallContext)
                        signalHandlersRef.current.forEach(handler => handler(data));
                    } else if (data.type === 'pong') {
                        // Alive
                    } else if (data.type === 'connected') {
                        console.log('Connected as', data.username);
                    } else if (data.type === 'user_status') {
                        setOnlineUsers(prev => {
                            const newMap = new Map(prev);
                            if (data.status === 'online') {
                                newMap.set(data.user_id, 'online');
                            } else {
                                newMap.delete(data.user_id);
                            }
                            return newMap;
                        });
                    } else if (data.type === 'message_updated') {
                        const msg = data.message;
                        const existing = await db.messages.get(msg.id);
                        if (existing) {
                            await db.messages.put({
                                ...existing,
                                content: msg.content,
                                updated_at: new Date(msg.updated_at),
                                is_edited: true
                            });
                            setLastUpdate(Date.now());
                        }
                    } else if (['friend_request', 'friend_accepted', 'friend_request_rejected'].includes(data.type)) {
                        setLastFriendUpdate(Date.now());

                        // Show notification if supported
                        if (Notification.permission === 'granted' && document.hidden) {
                            if (data.type === 'friend_request') {
                                new Notification('New Friend Request', {
                                    body: `${data.sender.username} sent you a friend request`,
                                    icon: '/pwa-192x192.png' // assumption
                                });
                            } else if (data.type === 'friend_accepted') {
                                new Notification('Friend Request Accepted', {
                                    body: `${data.friend.username} accepted your friend request`,
                                    icon: '/pwa-192x192.png'
                                });
                            }
                        }
                    } else if (data.type === 'message_read') {
                        const { message_id, user_id, read_at } = data;
                        const existing = await db.messages.get(message_id);
                        if (existing) {
                            const newReceipt = { id: `rr-${Date.now()}-${Math.random()}`, message_id, user_id, read_at };
                            const receipts = existing.read_receipts || [];
                            // Avoid duplicates
                            if (!receipts.find((r: any) => r.user_id === user_id)) {
                                await db.messages.put({
                                    ...existing,
                                    read_receipts: [...receipts, newReceipt]
                                });
                                setLastUpdate(Date.now());
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error processing WebSocket message:', err);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected');
                setConnectionStatus('disconnected');
                wsRef.current = null;
                setOnlineUsers(new Map());
                if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

                if (token) {
                    const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttemptsRef.current));
                    reconnectAttemptsRef.current++;
                    reconnectTimeoutRef.current = window.setTimeout(() => {
                        console.log(`Reconnecting... (attempt ${reconnectAttemptsRef.current})`);
                        connect();
                    }, delay);
                }
            };
        } catch (err) {
            console.error('Failed to create WebSocket:', err);
            setConnectionStatus('disconnected');
        }
    };

    useEffect(() => {
        if (token && user) {
            connect();
        }

        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            if (wsRef.current) wsRef.current.close();
        };
    }, [token, user]);

    // Strict Sync on Window Focus (Updated logic)
    useEffect(() => {
        const handleFocus = () => {
            const now = Date.now();
            // Reduced throttle on focus to ensure immediate responsiveness
            if (now - lastUpdate > 1000) {
                console.log("Window focused, syncing messages...");
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    syncMessages();
                } else if (token && user) {
                    connect();
                }
            }
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [token, user, lastUpdate]);

    const sendMessage = async (roomId: string, content: string, correlationId?: string) => {
        const cid = correlationId || `msg-${Date.now()}-${Math.random()}`;
        const timestamp = new Date();

        // 1. Optimistic Persistence
        if (user) {
            try {
                await db.messages.add({
                    content,
                    sender_id: user.id,
                    room_id: roomId,
                    message_type: 'text',
                    created_at: timestamp,
                    updated_at: timestamp,
                    is_deleted: false,
                    status: 'pending',
                    temp_id: cid,
                    id: cid // Fix for DataError: Key path "id" failure
                });
                setLastUpdate(Date.now()); // Trigger UI update if needed
            } catch (e) {
                console.error("Failed to save optimistic message", e);
            }
        }

        // 2. Send via WebSocket if open
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'message',
                room_id: roomId,
                content,
                correlation_id: cid
            }));

            // Trigger throttled sync to ensure consistency (e.g. if we were offline before)
            throttledSync();
        } else {
            console.log("WebSocket offline, message persisted as pending and will be synced later.");
            // Trigger background sync if valid
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                navigator.serviceWorker.ready.then(registration => {
                    return registration.sync.register('entropy-queue');
                }).catch(err => console.log("Bg Sync registration failed", err));
            }
        }
    };

    const joinRoom = (roomId: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'join_room',
                room_id: roomId,
            }));
        }
    };

    const leaveRoom = (roomId: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'leave_room',
                room_id: roomId,
            }));
        }
    };

    const markAsRead = (messageId: string, roomId: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'read_receipt',
                message_id: messageId,
                room_id: roomId,
            }));
        }
    };

    return (
        <WebSocketContext.Provider
            value={{
                sendMessage,
                joinRoom,
                leaveRoom,
                markAsRead,
                isConnected: connectionStatus === 'connected',
                connectionStatus,
                lastUpdate,
                lastFriendUpdate,
                onlineUsers,
                sendSignal,
                registerSignalHandler
            }}
        >
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocket() {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocket must be used within WebSocketProvider');
    }
    return context;
}
