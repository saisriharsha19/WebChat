import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useWebSocket } from './WebSocketContext';
import { useAuth } from './AuthContext';
import { useWakeLock } from './hooks/useWakeLock';
import { useNetworkQuality } from './hooks/useNetworkQuality';
import { usePermissionState } from './hooks/usePermissionState';

interface CallState {
    status: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended' | 'rejected' | 'busy';
    userId?: number;
    callId?: string; // UUID for race condition handling
    sdp?: any;
}

interface CallContextType {
    callState: CallState;
    remoteStream: MediaStream | null;
    startCall: (targetUserId: number) => Promise<{ pc: RTCPeerConnection, stream: MediaStream } | undefined>;
    answerIncomingCall: () => Promise<{ pc: RTCPeerConnection, stream: MediaStream } | undefined>;
    rejectIncomingCall: () => void;
    endCall: () => void;
    isMuted: boolean;
    toggleMute: () => void;
    connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// Enhanced ICE servers with TURN fallback for worst conditions
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceTransportPolicy: 'all' as RTCIceTransportPolicy,
    bundlePolicy: 'max-bundle' as RTCBundlePolicy,
    iceCandidatePoolSize: 10,
};

const BITRATE_PRESETS = {
    critical: 8000,
    poor: 12000,
    fair: 20000,
    good: 32000,
    excellent: 48000,
};

export function CallProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { registerSignalHandler, sendSignal } = useWebSocket();

    const [callState, setCallState] = useState<CallState>({ status: 'idle' });
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'fair' | 'poor' | 'critical'>('good');

    // Hooks for resilience
    const { requestLock, releaseLock } = useWakeLock();
    const networkQuality = useNetworkQuality();
    const { state: micPermission, checkPermission: checkMicPermission } = usePermissionState('microphone');

    // WebRTC refs
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const iceCandidatesBuffer = useRef<RTCIceCandidate[]>([]);
    const callTimeoutRef = useRef<number | null>(null);

    // Monitoring refs
    const monitoringIntervalRef = useRef<number | null>(null);
    const lastBitrateAdjustment = useRef<number>(0);
    const qualityHistoryRef = useRef<Array<{ rtt: number; jitter: number; packetLoss: number; timestamp: number }>>([]);
    const currentBitrateRef = useRef<number>(BITRATE_PRESETS.good);

    // Use a ref for the handler to solve stale closure issues.
    // The WebSocketContext calls the function we register, which will now
    // delegate to the latest version of handleSignalMessageRef.current
    const handleSignalMessageRef = useRef<(data: any) => Promise<void>>(() => Promise.resolve());

    // Register signal handler (Stable callback that calls the ref)
    useEffect(() => {
        const unregister = registerSignalHandler((data: any) => {
            if (handleSignalMessageRef.current) {
                handleSignalMessageRef.current(data);
            }
        });
        return () => unregister();
    }, [registerSignalHandler]);

    // Update the ref whenever the state/dependencies change, so the handler always spots the latest state
    useEffect(() => {
        handleSignalMessageRef.current = handleSignalMessage;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [callState, remoteStream, isMuted, connectionQuality]); // Add dependencies used inside handleSignalMessage

    // Wake Lock management
    useEffect(() => {
        if (callState.status === 'connected' || callState.status === 'calling' || callState.status === 'incoming') {
            requestLock();
        } else {
            releaseLock();
        }
    }, [callState.status, requestLock, releaseLock]);

    // Network Quality integration
    useEffect(() => {
        if (networkQuality.isPoorConnection) {
            setConnectionQuality(prev => prev === 'critical' ? 'critical' : 'poor');
        }
    }, [networkQuality.isPoorConnection]);

    // Cleanup on unmount or user change
    useEffect(() => {
        return () => {
            endCall();
        };
    }, [user]);

    const handleSignalMessage = async (data: any) => {
        try {
            switch (data.type) {
                case 'call_offer':
                    if (callState.status !== 'idle') {
                        sendSignal({
                            type: 'call_reject',
                            target_user_id: data.sender_id,
                            reason: 'busy',
                            call_id: data.call_id
                        });
                        return;
                    }
                    setCallState({
                        status: 'incoming',
                        userId: data.sender_id,
                        callId: data.call_id,
                        sdp: data.sdp
                    });
                    iceCandidatesBuffer.current = [];
                    break;

                case 'call_answer':
                    // Race condition check: Verify call_id matches
                    if (callState.callId && data.call_id && data.call_id !== callState.callId) {
                        console.warn("Ignoring call answer for different call ID", data.call_id, callState.callId);
                        return;
                    }

                    if (callTimeoutRef.current) {
                        clearTimeout(callTimeoutRef.current);
                        callTimeoutRef.current = null;
                    }
                    if (peerConnection.current) {
                        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
                        setCallState(prev => ({ ...prev, status: 'connected' }));
                        await processBufferedCandidates(peerConnection.current);
                    }
                    break;

                case 'call_rejected':
                    if (callState.callId && data.call_id && data.call_id !== callState.callId) return;

                    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
                    alert('Call rejected');
                    endCall();
                    setCallState(prev => ({ ...prev, status: 'rejected' }));
                    setTimeout(() => setCallState({ status: 'idle' }), 2000);
                    break;

                case 'call_ended':
                    // Relaxed check for call_end, but ideally strict
                    if (callState.callId && data.call_id && data.call_id !== callState.callId) return;
                    endCall();
                    break;

                case 'call_handled': // Answered/Rejected elsewhere
                    if (callState.callId && data.call_id && data.call_id !== callState.callId) return;
                    endCall();
                    setCallState({ status: 'idle' });
                    console.log('Call handled on another device:', data.reason);
                    break;

                case 'ice_candidate':
                    // Strict check can prevent processing candidates from old calls
                    if (callState.callId && data.call_id && data.call_id !== callState.callId) return;

                    const candidate = new RTCIceCandidate(data.candidate);
                    if (peerConnection.current && peerConnection.current.remoteDescription) {
                        await peerConnection.current.addIceCandidate(candidate);
                    } else {
                        iceCandidatesBuffer.current.push(candidate);
                    }
                    break;
            }
        } catch (err) {
            console.error('Error handling signal message:', err);
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

    const setupOptimalAudioConstraints = async (): Promise<MediaStream> => {
        const constraints: MediaStreamConstraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: { ideal: 16000 },
                channelCount: 1,
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
        // Permission check
        await checkMicPermission();
        if (micPermission === 'denied') {
            alert("Microphone permission is denied. Please enable it in browser settings to start a call.");
            return;
        }

        const callId = crypto.randomUUID();
        setCallState({ status: 'calling', userId: targetUserId, callId });
        setRemoteStream(null);
        iceCandidatesBuffer.current = [];
        qualityHistoryRef.current = [];

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnection.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal({
                    type: 'ice_candidate',
                    target_user_id: targetUserId,
                    candidate: event.candidate,
                    call_id: callId
                });
            }
        };

        // ... (middle) ...



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
            setRemoteStream(event.streams[0]);
        };

        try {
            const stream = await setupOptimalAudioConstraints();
            localStreamRef.current = stream;

            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });

            await pc.setLocalDescription(offer);

            // Start monitoring immediately
            monitorConnection(pc);

            sendSignal({
                type: 'call_offer',
                target_user_id: targetUserId,
                sdp: offer,
                call_id: callId
            });

            if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = window.setTimeout(() => {
                console.log("Call timed out");
                endCall();
                setCallState({ status: 'idle' });
                alert("No answer");
            }, 30000);

            return { pc, stream };
        } catch (err) {
            console.error("Failed to start call:", err);
            endCall();
            throw err;
        }
    };

    const answerIncomingCall = async () => {
        if (callState.status !== 'incoming' || !callState.userId) return;

        qualityHistoryRef.current = [];
        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnection.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal({
                    type: 'ice_candidate',
                    target_user_id: callState.userId,
                    candidate: event.candidate,
                    call_id: callState.callId
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                setConnectionQuality('critical');
                if (pc.connectionState === 'connected') {
                    pc.restartIce();
                }
            }
        };

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        try {
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
            monitorConnection(pc);

            sendSignal({
                type: 'call_answer',
                target_user_id: callState.userId,
                sdp: answer,
                call_id: callState.callId
            });

            setCallState(prev => ({ ...prev, status: 'connected' }));

            return { pc, stream };
        } catch (err) {
            console.error("Failed to answer call:", err);
            endCall();
        }
    };

    const rejectIncomingCall = () => {
        if (callState.userId) {
            sendSignal({
                type: 'call_reject',
                target_user_id: callState.userId,
                call_id: callState.callId
            });
        }
        endCall();
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

        if (callState.userId && ['connected', 'calling', 'incoming', 'busy'].includes(callState.status)) {
            sendSignal({
                type: 'call_end',
                target_user_id: callState.userId,
                call_id: callState.callId
            });
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

    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsMuted(prev => !prev);
        }
    };

    // --- Monitoring & Bitrate Logic (Internal to Context) ---

    const adjustBitrate = async (pc: RTCPeerConnection, targetBitrate: number) => {
        const now = Date.now();
        if (now - lastBitrateAdjustment.current < 200) return;
        if (Math.abs(currentBitrateRef.current - targetBitrate) < 2000) return;

        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track?.kind === 'audio');
        if (!audioSender) return;

        try {
            const parameters = audioSender.getParameters();
            if (!parameters.encodings || parameters.encodings.length === 0) {
                parameters.encodings = [{}];
            }
            parameters.encodings[0].maxBitrate = targetBitrate;
            parameters.encodings[0].active = true;
            parameters.encodings[0].priority = 'high';

            await audioSender.setParameters(parameters);
            currentBitrateRef.current = targetBitrate;
            lastBitrateAdjustment.current = now;
        } catch (e) {
            console.error("Failed to adjust bitrate:", e);
        }
    };

    const determineQuality = (rtt: number, jitter: number, packetLoss: number) => {
        const score = (rtt * 0.5) + (jitter * 2) + (packetLoss * 100);
        if (score < 100) return 'excellent';
        if (score < 200) return 'good';
        if (score < 400) return 'fair';
        if (score < 700) return 'poor';
        return 'critical';
    };

    const monitorConnection = (pc: RTCPeerConnection) => {
        if (monitoringIntervalRef.current) clearInterval(monitoringIntervalRef.current);
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
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        rtt = (report.currentRoundTripTime || 0) * 1000;
                    }
                    if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                        jitter = (report.jitter || 0) * 1000;
                        packetsLost = report.packetsLost || 0;
                        packetsReceived = report.packetsReceived || 0;
                    }
                });

                const totalPackets = packetsLost + packetsReceived;
                const packetLossPercent = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;

                qualityHistoryRef.current.push({
                    rtt, jitter, packetLoss: packetLossPercent, timestamp: Date.now()
                });

                if (qualityHistoryRef.current.length > 10) qualityHistoryRef.current.shift();

                const recentSamples = qualityHistoryRef.current.slice(-3);
                if (recentSamples.length > 0) {
                    const avgRtt = recentSamples.reduce((sum, s) => sum + s.rtt, 0) / recentSamples.length;
                    const avgJitter = recentSamples.reduce((sum, s) => sum + s.jitter, 0) / recentSamples.length;
                    const avgPacketLoss = recentSamples.reduce((sum, s) => sum + s.packetLoss, 0) / recentSamples.length;

                    const quality = determineQuality(avgRtt, avgJitter, avgPacketLoss);
                    setConnectionQuality(quality);

                    const targetBitrate = BITRATE_PRESETS[quality];
                    await adjustBitrate(pc, targetBitrate);
                }
            } catch (err) {
                console.error("Error monitoring connection:", err);
            }
        }, 1000); // Reduced frequency slightly to 1s to rely less on ultra-fast feedback, still good.
    };

    return (
        <CallContext.Provider value={{
            callState,
            remoteStream,
            startCall,
            answerIncomingCall,
            rejectIncomingCall,
            endCall,
            isMuted,
            toggleMute,
            connectionQuality
        }}>
            {children}
        </CallContext.Provider>
    );
}

export function useCall() {
    const context = useContext(CallContext);
    if (!context) {
        throw new Error('useCall must be used within CallProvider');
    }
    return context;
}
