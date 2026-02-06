import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext.tsx';
import { API_ENDPOINTS } from './lib/api.ts';
import { db } from './lib/db.ts';

type WSMessage = {
    type: string;
    [key: string]: any;
};

interface WebSocketContextType {
    sendMessage: (roomId: number, content: string) => void;
    joinRoom: (roomId: number) => void;
    leaveRoom: (roomId: number) => void;
    markAsRead: (messageId: number, roomId: number) => void;
    isConnected: boolean;
    lastUpdate: number;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { token, user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(0); // Forcing re-renders
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);

    const connect = () => {
        if (!token) return;

        try {
            const ws = new WebSocket(API_ENDPOINTS.wsChat(token));
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('WebSocket connected');
                setIsConnected(true);
                reconnectAttemptsRef.current = 0;
            };

            ws.onmessage = async (event) => {
                try {
                    const data: WSMessage = JSON.parse(event.data);

                    if (data.type === 'connected') {
                        console.log('Connected as', data.username);
                    } else if (data.type === 'new_message') {
                        // Save to IndexedDB
                        const msg = data.message;
                        await db.messages.put({
                            id: msg.id,
                            content: msg.content,
                            sender_id: msg.sender_id,
                            room_id: parseInt(msg.room_id), // Ensure int
                            message_type: msg.message_type || 'text',
                            created_at: new Date(msg.created_at),
                            updated_at: new Date(msg.created_at),
                            is_deleted: false,
                            status: 'synced',
                            attachments: msg.attachments || [] // Handle attachments
                        });
                        setLastUpdate(Date.now());
                    } else if (data.type === 'message_updated') {
                        console.log("WS: Received message_updated", data.message);
                        // Handle edits
                        const msg = data.message;
                        await db.messages.update(msg.id, {
                            content: msg.content,
                            is_edited: true,
                            updated_at: new Date(msg.updated_at)
                        });
                        console.log("WS: DB updated for msg", msg.id);
                        setLastUpdate(Date.now());
                    } else if (data.type === 'read_receipt') {
                        await db.readReceipts.put({
                            message_id: data.message_id,
                            user_id: data.user_id,
                            read_at: new Date(),
                        });
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
                setIsConnected(false);
                wsRef.current = null;

                // Exponential backoff reconnection
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
        }
    };

    useEffect(() => {
        if (token && user) {
            connect();
        }

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [token, user]);

    const sendMessage = (roomId: number, content: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'message',
                room_id: roomId,
                content,
            }));
        } else {
            // Save to IndexedDB with pending status
            const tempId = `temp-${Date.now()}-${Math.random()}`;
            db.messages.add({
                content,
                sender_id: user!.id,
                room_id: roomId,
                message_type: 'text',
                created_at: new Date(),
                updated_at: new Date(),
                is_deleted: false,
                status: 'pending',
                temp_id: tempId,
                attachments: []
            });
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
            value={{ sendMessage, joinRoom, leaveRoom, markAsRead, isConnected, lastUpdate }}
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
