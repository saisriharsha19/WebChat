import { useEffect } from 'react';

export function useAppBadge(count: number) {
    useEffect(() => {
        if ('setAppBadge' in navigator) {
            if (count > 0) {
                navigator.setAppBadge(count).catch((e) => console.error('Error setting badge:', e));
            } else {
                navigator.clearAppBadge().catch((e) => console.error('Error clearing badge:', e));
            }
        }
    }, [count]);
}
