import { useEffect, useState, useRef } from 'react';
import { useWebSocket } from '../WebSocketContext';
import { API_ENDPOINTS, fetchWithAuth } from '../lib/api';

export function VoiceCallModal() {
    const { incomingCall, answerIncomingCall, rejectIncomingCall } = useWebSocket();
    const [activeCall, setActiveCall] = useState<boolean>(false);
    const [_localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [callDuration, setCallDuration] = useState(0);
    const timerRef = useRef<number | null>(null);

    // For displaying caller info
    const [callerName, setCallerName] = useState<string>('Unknown');

    useEffect(() => {
        if (incomingCall) {
            // Fetch caller name
            fetchWithAuth(API_ENDPOINTS.getUser(incomingCall.callerId))
                .then(u => setCallerName(u.display_name || u.username))
                .catch(() => setCallerName('Unknown Caller'));
        }
    }, [incomingCall]);

    useEffect(() => {
        if (activeCall) {
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
    }, [activeCall]);

    const handleAnswer = async () => {
        try {
            const result = await answerIncomingCall();
            if (result) {
                setLocalStream(result.stream);
                setActiveCall(true);

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

    if (!incomingCall && !activeCall) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-md animate-fade-in">
            <div className="bg-surface-root border border-border-strong rounded-2xl p-8 w-[360px] text-center shadow-2xl relative overflow-hidden">
                {/* Background glow effect */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-accent/20 blur-[80px] rounded-full pointer-events-none"></div>

                <div className="relative z-10 flex flex-col items-center">
                    {!activeCall ? (
                        <>
                            <div className="relative mb-6">
                                <div className="w-24 h-24 bg-surface-sidebar border border-border rounded-2xl flex items-center justify-center shadow-lg">
                                    <span className="text-4xl text-txt-secondary font-bold">
                                        {callerName?.[0]?.toUpperCase()}
                                    </span>
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-surface-root rounded-full flex items-center justify-center p-1 border-2 border-surface-root shadow-sm">
                                    <div className="w-full h-full bg-accent rounded-full animate-ping opacity-75 absolute"></div>
                                    <div className="w-full h-full bg-accent rounded-full relative"></div>
                                </div>
                            </div>

                            <h3 className="text-txt-primary text-xl font-semibold mb-2">{callerName}</h3>
                            <p className="text-txt-tertiary text-sm mb-8">Incoming Voice Call...</p>

                            <div className="flex gap-6 justify-center">
                                <button
                                    onClick={rejectIncomingCall}
                                    className="w-14 h-14 bg-surface-hover hover:bg-red-500/10 text-txt-secondary hover:text-red-500 border border-border hover:border-red-500/50 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-105"
                                    title="Decline"
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                                <button
                                    onClick={handleAnswer}
                                    className="w-14 h-14 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-all duration-300 shadow-lg shadow-green-500/20 transform hover:scale-105 animate-pulse-slow"
                                    title="Answer"
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="relative mb-6">
                                <div className="w-24 h-24 bg-surface-sidebar border border-accent/30 rounded-2xl flex items-center justify-center shadow-lg shadow-accent/10">
                                    <span className="text-4xl text-txt-primary font-bold">
                                        {callerName?.[0]?.toUpperCase()}
                                    </span>
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-surface-root rounded-full flex items-center justify-center p-1 border-2 border-surface-root">
                                    <div className="w-full h-full bg-green-500 rounded-full"></div>
                                </div>
                            </div>

                            <h3 className="text-txt-primary text-xl font-semibold mb-2">{callerName}</h3>
                            <p className="text-accent text-sm font-medium mb-8 tracking-wide font-mono bg-accent/10 px-3 py-1 rounded-full border border-accent/20">
                                {floatToTime(callDuration)}
                            </p>

                            <div className="flex gap-4 justify-center">
                                {/* Mute button placeholder */}
                                <button className="w-12 h-12 bg-surface-hover hover:bg-surface-sidebar text-txt-secondary border border-border rounded-full flex items-center justify-center transition-all">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                                </button>

                                <button
                                    onClick={() => {
                                        window.location.reload();
                                    }}
                                    className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-all shadow-lg shadow-red-500/20 transform hover:scale-105"
                                >
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
