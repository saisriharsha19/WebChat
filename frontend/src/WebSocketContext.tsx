import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext.tsx';
import { API_ENDPOINTS } from './lib/api.ts';
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
    callState: {
        status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended' | 'rejected' | 'busy';
        userId?: number;
        sdp?: any;
    };
    remoteStream: MediaStream | null;
    startCall: (targetUserId: number) => Promise<{ pc: RTCPeerConnection, stream: MediaStream }>;
    answerIncomingCall: () => Promise<{ pc: RTCPeerConnection, stream: MediaStream } | undefined>;
    rejectIncomingCall: () => void;
    endCall: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ]
};

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { token, user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [lastUpdate, setLastUpdate] = useState(0); // Forcing re-renders
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const pingIntervalRef = useRef<number | null>(null);

    const [onlineUsers, setOnlineUsers] = useState<Map<number, string>>(new Map());

    // Unified Call State
    const [callState, setCallState] = useState<{
        status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended' | 'rejected' | 'busy';
        userId?: number;
        sdp?: any;
    }>({ status: 'idle' });
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    // WebRTC refs
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const iceCandidatesBuffer = useRef<RTCIceCandidate[]>([]);

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

                // Start Heartbeat
                if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = window.setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping' }));
                    }
                }, 30000); // 30s ping
            };

            ws.onmessage = async (event) => {
                try {
                    const data: WSMessage = JSON.parse(event.data);

                    if (data.type === 'pong') {
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
                    } else if (data.type === 'new_message') {
                        const msg = data.message;
                        const correlationId = data.correlation_id;

                        // Deduplication: If we have a pending message with this correlationId (temp_id), remove it first
                        if (correlationId) {
                            try {
                                const pending = await db.messages.where('temp_id').equals(correlationId).first();
                                if (pending) {
                                    await db.messages.delete(pending.id!); // local id might be auto-incremented or same as temp info
                                }
                            } catch (e) {
                                console.warn("Deduplication check failed", e);
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
                        setLastUpdate(Date.now());
                    } else if (data.type === 'message_updated') {
                        // ... (existing code)
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
                    } else if (data.type === 'call_offer') {
                        // ... (existing code)
                        if (callState.status !== 'idle') {
                            ws.send(JSON.stringify({
                                type: 'call_reject',
                                target_user_id: data.sender_id,
                                reason: 'busy'
                            }));
                            return;
                        }

                        setCallState({
                            status: 'incoming',
                            userId: data.sender_id,
                            sdp: data.sdp
                        });
                        iceCandidatesBuffer.current = [];
                    }
                    // ... (rest of message handling)
                    else if (data.type === 'call_answer') {
                        if (peerConnection.current) {
                            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
                            setCallState(prev => ({ ...prev, status: 'connected' }));
                        }
                    } else if (data.type === 'call_rejected') {
                        alert('Call rejected');
                        endCall();
                        setCallState(prev => ({ ...prev, status: 'rejected' }));
                        setTimeout(() => setCallState({ status: 'idle' }), 2000);
                    } else if (data.type === 'call_handled') {
                        // Call answered or rejected on another device
                        endCall();
                        setCallState({ status: 'idle' });
                        // Optionally show a toast here
                        console.log('Call handled on another device:', data.reason);
                    } else if (data.type === 'ice_candidate') {
                        const candidate = new RTCIceCandidate(data.candidate);
                        if (peerConnection.current && peerConnection.current.remoteDescription) {
                            await peerConnection.current.addIceCandidate(candidate);
                        } else {
                            // Buffer candidate
                            iceCandidatesBuffer.current.push(candidate);
                        }
                    } else if (data.type === 'message_ack') {
                        // Could update local message status to 'delivered'
                    }
                } catch (err) {
                    console.error('Error processing WebSocket message:', err);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            ws.onclose = () => {
                // ... (existing OnClose)
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
            endCall();
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
            // Offline support logic
            // Check if we already added it (optimistic UI might have done it)
            // If correlationId is passed, likely ChatRoom already added it to DB.
            if (!correlationId) {
                db.messages.add({
                    content,
                    sender_id: user!.id,
                    room_id: roomId,
                    message_type: 'text',
                    created_at: new Date(),
                    updated_at: new Date(),
                    is_deleted: false,
                    status: 'pending',
                    temp_id: cid,
                    attachments: []
                });
            }
        }
    };

    const processBufferedCandidates = async (pc: RTCPeerConnection) => {
        while (iceCandidatesBuffer.current.length > 0) {
            const candidate = iceCandidatesBuffer.current.shift();
            if (candidate) {
                try {
                    await pc.addIceCandidate(candidate);
                } catch (e) {
                    console.error("Error adding buffered candidate", e);
                }
            }
        }
    };

    const startCall = async (targetUserId: number) => {
        setCallState({ status: 'calling', userId: targetUserId });
        setRemoteStream(null);
        iceCandidatesBuffer.current = [];

        const pc = new RTCPeerConnection(ICE_SERVERS);
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

        pc.oniceconnectionstatechange = () => {
            console.log("ICE Connection State:", pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                // Handle reconnection or drop
                alert("Call connection unstable or lost");
            }
        };

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
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
        if (callState.status !== 'incoming' || !callState.userId) return;

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnection.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice_candidate',
                    target_user_id: callState.userId,
                    candidate: event.candidate
                }));
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log("ICE Connection State:", pc.iceConnectionState);
        };

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        if (callState.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(callState.sdp));
            await processBufferedCandidates(pc);
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'call_answer',
                target_user_id: callState.userId,
                sdp: answer
            }));
        }

        setCallState(prev => ({ ...prev, status: 'connected' }));
        return { pc, stream };
    };

    const rejectIncomingCall = () => {
        if (callState.userId && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'call_reject',
                target_user_id: callState.userId
            }));
        }
        endCall();
    };

    const endCall = () => {
        setCallState({ status: 'idle' });
        setRemoteStream(null);
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
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
                sendMessage, joinRoom, leaveRoom, markAsRead, isConnected: connectionStatus === 'connected', connectionStatus, lastUpdate,
                onlineUsers, callState, remoteStream, startCall, answerIncomingCall, rejectIncomingCall, endCall
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
