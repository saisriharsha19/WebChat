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
    sendMessage: (roomId: number, content: string, correlationId?: string) => void;
    joinRoom: (roomId: number) => void;
    leaveRoom: (roomId: number) => void;
    markAsRead: (messageId: number, roomId: number) => void;
    isConnected: boolean;
    connectionStatus: ConnectionStatus;
    lastUpdate: number;
    onlineUsers: Map<number, string>;

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
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const pingIntervalRef = useRef<number | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<Map<number, string>>(new Map());

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
                // Process new messages from server
                for (const msg of response.new_messages) {
                    await db.messages.put({
                        id: msg.id,
                        content: msg.content,
                        sender_id: msg.sender_id,
                        room_id: parseInt(msg.room_id),
                        message_type: msg.message_type || 'text',
                        created_at: new Date(msg.created_at),
                        updated_at: new Date(msg.created_at),
                        is_deleted: false,
                        status: 'synced',
                        attachments: msg.attachments || []
                    });
                }

                // Clean up pending that were synced
                // Assuming server processes all pending sent
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
                                room_id: parseInt(msg.room_id),
                                message_type: msg.message_type || 'text',
                                created_at: new Date(msg.created_at),
                                updated_at: new Date(msg.created_at),
                                is_deleted: false,
                                status: 'synced',
                                attachments: msg.attachments || []
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
            if (wsRef.current) wsRef.current.close();
        };
    }, [token, user]);

    const sendMessage = (roomId: number, content: string, correlationId?: string) => {
        const cid = correlationId || `msg-${Date.now()}-${Math.random()}`;

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'message',
                room_id: roomId,
                content,
                correlation_id: cid
            }));
        } else {
            console.log("WebSocket offline, message queued in DB by caller or ignored if not persisted");
        }
    };

    const joinRoom = (roomId: number) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'join_room',
                room_id: roomId,
            }));
        }
    };

    const leaveRoom = (roomId: number) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'leave_room',
                room_id: roomId,
            }));
        }
    };

    const markAsRead = (messageId: number, roomId: number) => {
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