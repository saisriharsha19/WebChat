import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../lib/api';

interface HealthStatus {
    isHealthy: boolean;
    lastCheck: Date | null;
    backendVersion: string | null;
}

export function useHealthCheck(intervalMs: number = 60000) {
    const [healthStatus, setHealthStatus] = useState<HealthStatus>({
        isHealthy: true,
        lastCheck: null,
        backendVersion: null,
    });

    useEffect(() => {
        const checkHealth = async () => {
            try {
                const response = await fetch(API_ENDPOINTS.systemInfo, {
                    method: 'GET',
                    cache: 'no-cache',
                });

                if (response.ok) {
                    const data = await response.json();
                    setHealthStatus({
                        isHealthy: true,
                        lastCheck: new Date(),
                        backendVersion: data.instance_id,
                    });

                    // Check for version mismatch if we have a stored version
                    const storedVersion = localStorage.getItem('backend_version');
                    if (storedVersion && storedVersion !== data.instance_id) {
                        console.warn('Backend version changed, reloading...');
                        localStorage.setItem('backend_version', data.instance_id);
                        // Force reload after a short delay to let current operations complete
                        setTimeout(() => window.location.reload(), 2000);
                    } else if (!storedVersion) {
                        localStorage.setItem('backend_version', data.instance_id);
                    }
                } else {
                    setHealthStatus(prev => ({
                        ...prev,
                        isHealthy: false,
                        lastCheck: new Date(),
                    }));
                }
            } catch (error) {
                setHealthStatus(prev => ({
                    ...prev,
                    isHealthy: false,
                    lastCheck: new Date(),
                }));
            }
        };

        // Check immediately
        checkHealth();

        // Then check periodically
        const interval = setInterval(checkHealth, intervalMs);

        return () => clearInterval(interval);
    }, [intervalMs]);

    return healthStatus;
}
