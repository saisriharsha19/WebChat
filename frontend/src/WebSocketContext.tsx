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
    callState: {
        status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
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

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { token, user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(0); // Forcing re-renders
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);

    const [onlineUsers, setOnlineUsers] = useState<Map<number, string>>(new Map());

    // Unified Call State
    const [callState, setCallState] = useState<{
        status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';
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
                    } else if (data.type === 'message_updated') {
                        const msg = data.message;
                        // Update existing message in DB
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
                        setCallState({
                            status: 'incoming',
                            userId: data.sender_id,
                            sdp: data.sdp
                        });
                        // Clear buffer on new offer
                        iceCandidatesBuffer.current = [];
                    } else if (data.type === 'call_answer') {
                        if (peerConnection.current) {
                            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
                            setCallState(prev => ({ ...prev, status: 'connected' }));
                        }
                    } else if (data.type === 'ice_candidate') {
                        const candidate = new RTCIceCandidate(data.candidate);
                        if (peerConnection.current && peerConnection.current.remoteDescription) {
                            await peerConnection.current.addIceCandidate(candidate);
                        } else {
                            // Buffer candidate
                            console.log("Buffering ICE candidate");
                            iceCandidatesBuffer.current.push(candidate);
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
                setIsConnected(false);
                wsRef.current = null;
                setOnlineUsers(new Map());

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
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (wsRef.current) wsRef.current.close();
            // Cleanup generic if needed, but handled by endCall usually
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

    const processBufferedCandidates = async (pc: RTCPeerConnection) => {
        while (iceCandidatesBuffer.current.length > 0) {
            const candidate = iceCandidatesBuffer.current.shift();
            if (candidate) {
                try {
                    console.log("Adding buffered ICE candidate");
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

        pc.ontrack = (event) => {
            console.log("Track received:", event.streams[0]);
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

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
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

        pc.ontrack = (event) => {
            console.log("Track received:", event.streams[0]);
            setRemoteStream(event.streams[0]);
        };

        if (callState.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(callState.sdp));
            // After setting remote description, we can add candidates
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
        endCall();
        // Optional: send reject message
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
                sendMessage, joinRoom, leaveRoom, markAsRead, isConnected, lastUpdate,
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
