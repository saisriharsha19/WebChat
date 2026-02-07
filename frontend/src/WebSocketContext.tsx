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
    onlineUsers: Map<number, string>;
    incomingCall: { callerId: number, sdp: any } | null;
    startCall: (targetUserId: number) => Promise<{ pc: RTCPeerConnection, stream: MediaStream }>;
    answerIncomingCall: () => Promise<{ pc: RTCPeerConnection, stream: MediaStream } | undefined>;
    rejectIncomingCall: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { token, user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(0); // Forcing re-renders
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);

    const [onlineUsers, setOnlineUsers] = useState<Map<number, string>>(new Map());
    const [incomingCall, setIncomingCall] = useState<{ callerId: number, sdp: any } | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [callAccepted, setCallAccepted] = useState(false);

    // WebRTC refs
    const peerConnection = useRef<RTCPeerConnection | null>(null);

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
                    } else if (data.type === 'new_message') {
                        // ... existing message logic ...
                        const msg = data.message;
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
                        setLastUpdate(Date.now());
                    } else if (data.type === 'call_offer') {
                        setIncomingCall({ callerId: data.sender_id, sdp: data.sdp });
                    } else if (data.type === 'call_answer') {
                        if (peerConnection.current) {
                            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
                        }
                    } else if (data.type === 'ice_candidate') {
                        if (peerConnection.current) {
                            await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                        }
                    }
                    // ... other message types ...
                } catch (err) {
                    console.error('Error processing WebSocket message:', err);
                }
            };

            // ... existing onerror/onclose ...
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected');
                setIsConnected(false);
                wsRef.current = null;
                setOnlineUsers(new Map()); // Clear online users

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

    // ... useEffect ...
    useEffect(() => {
        if (token && user) {
            connect();
        }
        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) wsRef.current.close();
            if (peerConnection.current) peerConnection.current.close();
        };
    }, [token, user]);

    // ... existing messaging methods ...
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

    // New WebRTC methods
    const startCall = async (targetUserId: number) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        peerConnection.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice_candidate',
                    target_user_id: targetUserId,
                    candidate: event.candidate
                }));
            }
        };

        // Create stream (audio only for now per request "voice call")
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'call_offer',
                target_user_id: targetUserId,
                sdp: offer
            }));
        }

        return { pc, stream };
    };

    const answerIncomingCall = async () => {
        if (!incomingCall) return;

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        peerConnection.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice_candidate',
                    target_user_id: incomingCall.callerId,
                    candidate: event.candidate
                }));
            }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.sdp));

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'call_answer',
                target_user_id: incomingCall.callerId,
                sdp: answer
            }));
        }

        setIncomingCall(null);
        setCallAccepted(true);
        return { pc, stream };
    };

    const rejectIncomingCall = () => {
        setIncomingCall(null);
        // Optional: send reject message
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
                sendMessage, joinRoom, leaveRoom, markAsRead, isConnected, lastUpdate,
                onlineUsers, incomingCall, startCall, answerIncomingCall, rejectIncomingCall
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
