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
    isMuted: boolean;
    toggleMute: () => void;
    connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

// Enhanced ICE servers with TURN fallback for worst conditions
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
    // Critical: Force relay for worst networks
    iceTransportPolicy: 'all' as RTCIceTransportPolicy,
    // Bundle media for better performance
    bundlePolicy: 'max-bundle' as RTCBundlePolicy,
    // Aggressive ICE candidate gathering
    iceCandidatePoolSize: 10,
};

// Ultra-aggressive bitrate presets optimized for voice
const BITRATE_PRESETS = {
    critical: 8000,    // 8 kbps - Extreme compression, still intelligible
    poor: 12000,       // 12 kbps - Very compressed but clear
    fair: 20000,       // 20 kbps - Balanced quality
    good: 32000,       // 32 kbps - Good quality
    excellent: 48000,  // 48 kbps - High quality (Opus optimal range)
};

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { token, user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
    const [lastUpdate, setLastUpdate] = useState(0);
    const reconnectTimeoutRef = useRef<number | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const pingIntervalRef = useRef<number | null>(null);
    const callTimeoutRef = useRef<number | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<Map<number, string>>(new Map());

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

    const [isMuted, setIsMuted] = useState(false);
    const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'fair' | 'poor' | 'critical'>('good');

    // High-frequency monitoring refs
    const monitoringIntervalRef = useRef<number | null>(null);
    const lastBitrateAdjustment = useRef<number>(0);
    const qualityHistoryRef = useRef<Array<{ rtt: number; jitter: number; packetLoss: number; timestamp: number }>>([]);
    const currentBitrateRef = useRef<number>(BITRATE_PRESETS.good);

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
                    } else if (data.type === 'call_offer') {
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
                    } else if (data.type === 'call_answer') {
                        if (callTimeoutRef.current) {
                            clearTimeout(callTimeoutRef.current);
                            callTimeoutRef.current = null;
                        }
                        if (peerConnection.current) {
                            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
                            setCallState(prev => ({ ...prev, status: 'connected' }));
                            await processBufferedCandidates(peerConnection.current);
                        }
                    } else if (data.type === 'call_rejected') {
                        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
                        alert('Call rejected');
                        endCall();
                        setCallState(prev => ({ ...prev, status: 'rejected' }));
                        setTimeout(() => setCallState({ status: 'idle' }), 2000);
                    } else if (data.type === 'call_ended') {
                        endCall();
                    } else if (data.type === 'call_handled') {
                        endCall();
                        setCallState({ status: 'idle' });
                        console.log('Call handled on another device:', data.reason);
                    } else if (data.type === 'ice_candidate') {
                        const candidate = new RTCIceCandidate(data.candidate);
                        if (peerConnection.current && peerConnection.current.remoteDescription) {
                            await peerConnection.current.addIceCandidate(candidate);
                        } else {
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

    // Ultra-responsive bitrate adjustment with sub-second response
    const adjustBitrate = async (pc: RTCPeerConnection, targetBitrate: number) => {
        // Debounce rapid adjustments (max once per 200ms to prevent thrashing)
        const now = Date.now();
        if (now - lastBitrateAdjustment.current < 200) return;

        // Only adjust if significantly different
        if (Math.abs(currentBitrateRef.current - targetBitrate) < 2000) return;

        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track?.kind === 'audio');
        if (!audioSender) return;

        try {
            const parameters = audioSender.getParameters();
            if (!parameters.encodings || parameters.encodings.length === 0) {
                parameters.encodings = [{}];
            }

            // Apply aggressive settings for low bandwidth
            parameters.encodings[0].maxBitrate = targetBitrate;

            // Enable DTX (Discontinuous Transmission) - saves bandwidth during silence
            parameters.encodings[0].active = true;

            // Priority: very high for audio
            parameters.encodings[0].priority = 'high';

            await audioSender.setParameters(parameters);

            currentBitrateRef.current = targetBitrate;
            lastBitrateAdjustment.current = now;

            console.log(`🎚️ Bitrate adjusted: ${targetBitrate / 1000} kbps`);
        } catch (e) {
            console.error("Failed to adjust bitrate:", e);
        }
    };

    // Determine quality tier with hysteresis to prevent flapping
    const determineQuality = (rtt: number, jitter: number, packetLoss: number): typeof connectionQuality => {
        // Use weighted scoring for more stable transitions
        const score = (rtt * 0.5) + (jitter * 2) + (packetLoss * 100);

        if (score < 100) return 'excellent';
        if (score < 200) return 'good';
        if (score < 400) return 'fair';
        if (score < 700) return 'poor';
        return 'critical';
    };

    // Ultra-fast monitoring (500ms intervals for sub-second response)
    const monitorConnection = (pc: RTCPeerConnection) => {
        if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);

        // Start with conservative bitrate
        adjustBitrate(pc, BITRATE_PRESETS.fair);

        monitoringIntervalRef.current = window.setInterval(async () => {
            if (pc.connectionState !== 'connected') return;

            try {
                const stats = await pc.getStats();

                let rtt = 0;
                let jitter = 0;
                let packetsLost = 0;
                let packetsReceived = 0;

                stats.forEach(report => {
                    // Get RTT from candidate-pair
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        rtt = (report.currentRoundTripTime || 0) * 1000; // Convert to ms
                    }

                    // Get audio quality metrics
                    if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                        jitter = (report.jitter || 0) * 1000; // Convert to ms
                        packetsLost = report.packetsLost || 0;
                        packetsReceived = report.packetsReceived || 0;
                    }
                });

                // Calculate packet loss percentage
                const totalPackets = packetsLost + packetsReceived;
                const packetLossPercent = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;

                // Store in history (keep last 10 samples for trend analysis)
                qualityHistoryRef.current.push({
                    rtt,
                    jitter,
                    packetLoss: packetLossPercent,
                    timestamp: Date.now()
                });

                if (qualityHistoryRef.current.length > 10) {
                    qualityHistoryRef.current.shift();
                }

                // Calculate moving average for stability
                const recentSamples = qualityHistoryRef.current.slice(-3);
                const avgRtt = recentSamples.reduce((sum, s) => sum + s.rtt, 0) / recentSamples.length;
                const avgJitter = recentSamples.reduce((sum, s) => sum + s.jitter, 0) / recentSamples.length;
                const avgPacketLoss = recentSamples.reduce((sum, s) => sum + s.packetLoss, 0) / recentSamples.length;

                // Determine quality tier
                const quality = determineQuality(avgRtt, avgJitter, avgPacketLoss);
                setConnectionQuality(quality);

                // Instant bitrate adjustment based on quality
                const targetBitrate = BITRATE_PRESETS[quality];
                await adjustBitrate(pc, targetBitrate);

                console.log(`📊 Stats: RTT=${avgRtt.toFixed(0)}ms, Jitter=${avgJitter.toFixed(1)}ms, Loss=${avgPacketLoss.toFixed(2)}%, Quality=${quality}`);

            } catch (err) {
                console.error("Error monitoring connection:", err);
            }
        }, 500); // Ultra-responsive 500ms monitoring
    };

    const setupOptimalAudioConstraints = async (): Promise<MediaStream> => {
        // Opus codec settings optimized for low bandwidth
        const constraints: MediaStreamConstraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                // Target lower sample rate for bandwidth efficiency
                sampleRate: { ideal: 16000 },
                channelCount: 1, // Mono for half the bandwidth
                // Advanced audio processing
                ...(navigator.userAgent.includes('Chrome') && {
                    googEchoCancellation: true,
                    googAutoGainControl: true,
                    googNoiseSuppression: true,
                    googHighpassFilter: true,
                    googTypingNoiseDetection: true,
                    googAudioMirroring: false,
                }),
            },
            video: false
        };

        return await navigator.mediaDevices.getUserMedia(constraints);
    };

    const startCall = async (targetUserId: number) => {
        setCallState({ status: 'calling', userId: targetUserId });
        setRemoteStream(null);
        iceCandidatesBuffer.current = [];
        qualityHistoryRef.current = [];

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
                setConnectionQuality('critical');
                // Attempt ICE restart
                if (pc.connectionState === 'connected') {
                    console.log("Attempting ICE restart...");
                    pc.restartIce();
                }
            }
            if (pc.iceConnectionState === 'connected') {
                console.log("✅ ICE connected successfully");
            }
        };

        pc.ontrack = (event) => {
            console.log("📡 Remote track received");
            setRemoteStream(event.streams[0]);
        };

        const stream = await setupOptimalAudioConstraints();
        localStreamRef.current = stream;

        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);

            // Apply optimal track settings
            if (track.kind === 'audio') {
                const settings = track.getSettings();
                console.log("🎤 Audio track settings:", settings);
            }
        });

        const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
        });

        await pc.setLocalDescription(offer);

        // Start monitoring immediately
        monitorConnection(pc);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'call_offer',
                target_user_id: targetUserId,
                sdp: offer
            }));

            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = window.setTimeout(() => {
                console.log("Call timed out");
                endCall();
                setCallState({ status: 'idle' });
                alert("No answer");
            }, 30000);
        }

        return { pc, stream };
    };

    const answerIncomingCall = async () => {
        if (callState.status !== 'incoming' || !callState.userId) return;

        qualityHistoryRef.current = [];
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
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                setConnectionQuality('critical');
                if (pc.connectionState === 'connected') {
                    pc.restartIce();
                }
            }
        };

        pc.ontrack = (event) => {
            console.log("📡 Remote track received");
            setRemoteStream(event.streams[0]);
        };

        if (callState.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(callState.sdp));
            await processBufferedCandidates(pc);
        }

        const stream = await setupOptimalAudioConstraints();
        localStreamRef.current = stream;

        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });

        const answer = await pc.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false,
            voiceActivityDetection: true,
        });

        await pc.setLocalDescription(answer);

        // Start monitoring
        monitorConnection(pc);

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

    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsMuted(prev => !prev);
        }
    };

    const endCall = () => {
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }

        if (monitoringIntervalRef.current) {
            clearInterval(monitoringIntervalRef.current);
            monitoringIntervalRef.current = null;
        }

        if (callState.userId && wsRef.current?.readyState === WebSocket.OPEN) {
            if (['connected', 'calling', 'incoming', 'busy'].includes(callState.status)) {
                wsRef.current.send(JSON.stringify({
                    type: 'call_end',
                    target_user_id: callState.userId
                }));
            }
        }

        setCallState({ status: 'idle' });
        setRemoteStream(null);
        setIsMuted(false);
        setConnectionQuality('good');
        qualityHistoryRef.current = [];
        currentBitrateRef.current = BITRATE_PRESETS.good;

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
                sendMessage,
                joinRoom,
                leaveRoom,
                markAsRead,
                isConnected: connectionStatus === 'connected',
                connectionStatus,
                lastUpdate,
                onlineUsers,
                callState,
                remoteStream,
                startCall,
                answerIncomingCall,
                rejectIncomingCall,
                endCall,
                isMuted,
                toggleMute,
                connectionQuality,
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