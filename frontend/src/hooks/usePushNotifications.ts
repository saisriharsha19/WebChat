import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth, API_ENDPOINTS } from '../lib/api';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function usePushNotifications() {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [permission, setPermission] = useState(Notification.permission);

    // Initial check for existing subscription
    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready.then((registration) => {
                registration.pushManager.getSubscription().then((sub) => {
                    if (sub) {
                        setSubscription(sub);
                        setIsSubscribed(true);
                        // We do NOT automatically resend to backend here to avoid spamming on every reload
                        // The backend should persist it. 
                        // However, if we wanted to be sure, we could sync it once per session or token refresh.
                    }
                });
            });
        }
    }, []);

    const sendSubscriptionToBackend = useCallback(async (sub: PushSubscription) => {
        const keys = sub.toJSON().keys;
        if (!keys) return;

        try {
            await fetchWithAuth(API_ENDPOINTS.subscribePush, {
                method: 'POST',
                body: JSON.stringify({
                    endpoint: sub.endpoint,
                    keys: keys
                })
            });
            console.log("Subscription synced with backend");
        } catch (error) {
            console.error("Failed to send subscription to backend", error);
        }
    }, []);

    const subscribeToPush = useCallback(async () => {
        if (!('serviceWorker' in navigator)) return;

        try {
            const registration = await navigator.serviceWorker.ready;

            // 1. Check if already subscribed
            let sub = await registration.pushManager.getSubscription();

            // 2. If not, subscribe
            if (!sub) {
                // Fetch public key if we don't have it in env (fallback) 
                // but usually VITE_VAPID_PUBLIC_KEY should be set.
                // If we want to fetch it dynamically:
                let applicationServerKey = VAPID_PUBLIC_KEY ? urlBase64ToUint8Array(VAPID_PUBLIC_KEY) : undefined;

                if (!applicationServerKey) {
                    try {
                        const res = await fetchWithAuth(API_ENDPOINTS.vapidKey);
                        if (res && res.public_key) {
                            applicationServerKey = urlBase64ToUint8Array(res.public_key);
                        }
                    } catch (e) {
                        console.error("Could not fetch VAPID key", e);
                        return;
                    }
                }

                if (!applicationServerKey) {
                    console.error("No VAPID public key available (Env: " + (!!VAPID_PUBLIC_KEY) + ")");
                    return;
                }

                sub = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey
                });
            }

            setSubscription(sub);
            setIsSubscribed(true);
            setPermission(Notification.permission);

            // 3. Send to backend
            await sendSubscriptionToBackend(sub);

        } catch (error) {
            console.error("Failed to subscribe to push. Check console for details.", error);
        }
    }, [sendSubscriptionToBackend]);

    return { isSubscribed, subscribeToPush, subscription, permission };
}
