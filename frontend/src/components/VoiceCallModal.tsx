import { useEffect, useState, useRef } from 'react';
import { useWebSocket } from '../WebSocketContext';
import { API_ENDPOINTS, fetchWithAuth } from '../lib/api';

export function VoiceCallModal() {
    const { callState, answerIncomingCall, rejectIncomingCall, endCall } = useWebSocket();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [callDuration, setCallDuration] = useState(0);
    const timerRef = useRef<number | null>(null);

    // For displaying caller info
    const [peerName, setPeerName] = useState<string>('Unknown');

    useEffect(() => {
        if (callState.userId) {
            // Fetch peer name
            fetchWithAuth(API_ENDPOINTS.getUser(callState.userId))
                .then(u => setPeerName(u.display_name || u.username))
                .catch(() => setPeerName('Unknown User'));
        }
    }, [callState.userId]);

    useEffect(() => {
        if (callState.status === 'connected') {
            timerRef.current = window.setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
            setCallDuration(0);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [callState.status]);

    const handleAnswer = async () => {
        try {
            const result = await answerIncomingCall();
            if (result) {
                setLocalStream(result.stream);
                result.pc.ontrack = (event) => {
                    setRemoteStream(event.streams[0]);
                };
            }
        } catch (err) {
            console.error("Failed to answer call:", err);
            rejectIncomingCall();
        }
    };

    const floatToTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Hidden audio element for remote stream
    useEffect(() => {
        if (remoteStream) {
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.play();
        }
    }, [remoteStream]);

    if (callState.status === 'idle') return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-md animate-fade-in">
            <div className="bg-surface-root border border-border-strong rounded-2xl p-8 w-[360px] text-center shadow-2xl relative overflow-hidden">
                {/* Background glow effect */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-accent/20 blur-[80px] rounded-full pointer-events-none"></div>

                <div className="relative z-10 flex flex-col items-center">
                    {callState.status === 'incoming' && (
                        <>
                            <div className="relative mb-6">
                                <div className="w-24 h-24 bg-surface-sidebar border border-border rounded-2xl flex items-center justify-center shadow-lg">
                                    <span className="text-4xl text-txt-secondary font-bold">
                                        {peerName?.[0]?.toUpperCase()}
                                    </span>
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-surface-root rounded-full flex items-center justify-center p-1 border-2 border-surface-root shadow-sm">
                                    <div className="w-full h-full bg-accent rounded-full animate-ping opacity-75 absolute"></div>
                                    <div className="w-full h-full bg-accent rounded-full relative"></div>
                                </div>
                            </div>

                            <h3 className="text-txt-primary text-xl font-semibold mb-2">{peerName}</h3>
                            <p className="text-txt-tertiary text-sm mb-8">Incoming Voice Call...</p>

                            <div className="flex gap-6 justify-center">
                                <button
                                    onClick={rejectIncomingCall}
                                    className="w-14 h-14 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all hover:scale-105"
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1 3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                                </button>
                                <button
                                    onClick={handleAnswer}
                                    className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-500/30 transition-all hover:scale-105 hover:bg-green-400 animate-pulse"
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                </button>
                            </div>
                        </>
                    )}

                    {callState.status === 'calling' && (
                        <>
                            <div className="relative mb-6">
                                <div className="w-24 h-24 bg-surface-sidebar border border-border rounded-2xl flex items-center justify-center shadow-lg">
                                    <span className="text-4xl text-txt-secondary font-bold">
                                        {peerName?.[0]?.toUpperCase()}
                                    </span>
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-surface-root rounded-full flex items-center justify-center p-1 border-2 border-surface-root shadow-sm">
                                    <div className="w-full h-full bg-accent rounded-full animate-ping opacity-75 absolute"></div>
                                </div>
                            </div>

                            <h3 className="text-txt-primary text-xl font-semibold mb-2">{peerName}</h3>
                            <p className="text-txt-tertiary text-sm mb-8">Calling...</p>

                            <button
                                onClick={endCall}
                                className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30 transition-all hover:scale-105 hover:bg-red-400"
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1 3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                            </button>
                        </>
                    )}

                    {callState.status === 'connected' && (
                        <>
                            <div className="relative mb-6">
                                <div className="w-24 h-24 bg-surface-sidebar border border-border rounded-2xl flex items-center justify-center shadow-lg">
                                    <span className="text-4xl text-txt-secondary font-bold">
                                        {peerName?.[0]?.toUpperCase()}
                                    </span>
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-surface-root"></div>
                            </div>

                            <h3 className="text-txt-primary text-xl font-semibold mb-1">{peerName}</h3>
                            <div className="text-accent font-mono text-lg mb-8 bg-accent/10 px-3 py-1 rounded-md">
                                {floatToTime(callDuration)}
                            </div>

                            <div className="flex gap-6 justify-center">
                                {/* Mute button could go here */}
                                <button
                                    onClick={endCall}
                                    className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/30 transition-all hover:scale-105 hover:bg-red-400"
                                >
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1 3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
