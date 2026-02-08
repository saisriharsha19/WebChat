import { useState, useRef, useCallback, useEffect } from 'react';
import { usePageVisibility } from './usePageVisibility';

export function useWakeLock() {
    const [isLocked, setIsLocked] = useState(false);
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const isVisible = usePageVisibility();

    const requestLock = useCallback(async () => {
        if (!('wakeLock' in navigator)) return;

        try {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
            setIsLocked(true);

            wakeLockRef.current.addEventListener('release', () => {
                setIsLocked(false);
                console.log('Wake Lock released');
            });
            console.log('Wake Lock acquired');
        } catch (err) {
            console.error('Failed to acquire Wake Lock:', err);
        }
    }, []);

    const releaseLock = useCallback(async () => {
        if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
        }
    }, []);

    // Re-acquire lock if page becomes visible again and we were supposed to be locked
    // Note: This needs careful state management. For now, we rely on the consumer to re-request if needed
    // or we can auto-reacquire.
    useEffect(() => {
        if (isVisible && isLocked && !wakeLockRef.current) {
            requestLock();
        }
    }, [isVisible, isLocked, requestLock]);

    return { isLocked, requestLock, releaseLock };
}
