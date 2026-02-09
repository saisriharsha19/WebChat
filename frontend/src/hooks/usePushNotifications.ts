import { useState, useEffect, useCallback } from 'react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

    useEffect(() => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.ready.then((registration) => {
                registration.pushManager.getSubscription().then((sub) => {
                    if (sub) {
                        setSubscription(sub);
                        setIsSubscribed(true);
                        // Optionally re-send to backend to ensure sync
                        sendSubscriptionToBackend(sub);
                    }
                });
            });
        }
    }, []);

    const sendSubscriptionToBackend = useCallback(async (sub: PushSubscription) => {
        const keys = sub.toJSON().keys;
        if (!keys) return;

        try {
            const token = localStorage.getItem('token'); // Assuming standard token storage
            if (!token) return;

            await fetch(`${API_URL}/notifications/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    endpoint: sub.endpoint,
                    keys: keys
                })
            });
        } catch (error) {
            console.error("Failed to send subscription to backend", error);
        }
    }, []);

    const subscribeToPush = useCallback(async () => {
        if (!('serviceWorker' in navigator)) return;

        const registration = await navigator.serviceWorker.ready;

        try {
            // ALWAYS check for existing first to avoid "registration limit" errors
            let sub = await registration.pushManager.getSubscription();

            if (!sub) {
                // Only create new if none exists
                sub = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
            }

            setSubscription(sub);
            setIsSubscribed(true);
            setPermission(Notification.permission);
            await sendSubscriptionToBackend(sub);
            console.log("Subscribed to push notifications");
        } catch (error) {
            console.error("Failed to subscribe to push", error);
        }
    }, [sendSubscriptionToBackend]);

    return { isSubscribed, subscribeToPush, subscription, permission };
}
