import { useState, useEffect } from 'react';

type NetworkEffectiveType = 'slow-2g' | '2g' | '3g' | '4g';

export interface NetworkInformation extends EventTarget {
    effectiveType: NetworkEffectiveType;
    downlink: number;
    rtt: number;
    saveData: boolean;
    onchange: EventListener | null;
}

export function useNetworkQuality() {
    const [quality, setQuality] = useState<{
        effectiveType: NetworkEffectiveType | 'unknown';
        downlink: number | null;
        rtt: number | null;
        isPoorConnection: boolean;
    }>({
        effectiveType: 'unknown',
        downlink: null,
        rtt: null,
        isPoorConnection: false
    });

    useEffect(() => {
        const nav = navigator as any;
        const connection = (nav.connection || nav.mozConnection || nav.webkitConnection) as NetworkInformation;

        if (!connection) return;

        const updateQuality = () => {
            const { effectiveType, downlink, rtt } = connection;
            // Define poor connection heuristic: slow-2g/2g OR high latency (>500ms)
            const isPoor = effectiveType === 'slow-2g' || effectiveType === '2g' || (typeof rtt === 'number' && rtt > 500);

            setQuality({
                effectiveType,
                downlink,
                rtt,
                isPoorConnection: !!isPoor // Force boolean
            });
        };

        updateQuality();
        connection.addEventListener('change', updateQuality);

        return () => {
            connection.removeEventListener('change', updateQuality);
        };
    }, []);

    return quality;
}
