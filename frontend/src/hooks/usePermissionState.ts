import { useState, useEffect, useCallback } from 'react';

type PermissionNameExtended = PermissionName | 'microphone' | 'camera';

export function usePermissionState(permissionName: PermissionNameExtended) {
    const [state, setState] = useState<PermissionState | 'unknown'>('unknown');

    const checkPermission = useCallback(async () => {
        if (!navigator.permissions || !navigator.permissions.query) {
            // Fallback for browsers not supporting permissions API fully (like older Safari)
            // We might default to 'prompt' or 'unknown'
            setState('unknown');
            return;
        }

        try {
            const result = await navigator.permissions.query({ name: permissionName as PermissionName });
            setState(result.state);

            result.onchange = () => {
                setState(result.state);
            };
        } catch (error) {
            // Some permissions like 'microphone' might strictly require getUserMedia to check on some browsers
            // or the query API doesn't support it directly in all browsers.
            console.warn(`Permission query failed for ${permissionName}`, error);
            setState('unknown');
        }
    }, [permissionName]);

    useEffect(() => {
        checkPermission();
    }, [checkPermission]);

    return { state, checkPermission };
}
