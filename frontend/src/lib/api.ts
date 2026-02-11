/// <reference types="vite/client" />
export const API_URL = import.meta.env.VITE_API_URL || 'https://webchat-8bvf.onrender.com';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'wss://webchat-8bvf.onrender.com';

export const API_ENDPOINTS = {
    // Auth
    register: `${API_URL}/auth/register`,
    login: `${API_URL}/auth/login`,
    logout: `${API_URL}/auth/logout`,
    me: `${API_URL}/auth/me`,

    // Users
    getUser: (userId: string) => `${API_URL}/api/users/${userId}`,
    getUsers: (search?: string) => `${API_URL}/api/users${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    updateProfile: `${API_URL}/api/users/me/profile`,

    // Rooms
    getRooms: `${API_URL}/rooms/`,
    getRoom: (roomId: string) => `${API_URL}/rooms/${roomId}`,
    createDM: (userId: string) => `${API_URL}/rooms/dm?target_user_id=${userId}`,
    createGroup: `${API_URL}/rooms/group`,
    leaveRoom: (roomId: string) => `${API_URL}/rooms/${roomId}/leave`,
    deleteRoom: (roomId: string) => `${API_URL}/rooms/${roomId}`,

    // Messages
    getMessages: (roomId: string, skip = 0, limit = 50) =>
        `${API_URL}/api/messages?room_id=${roomId}&skip=${skip}&limit=${limit}`,
    editMessage: (id: string) => `${API_URL}/messages/${id}`,
    markRead: (messageId: string) => `${API_URL}/api/messages/${messageId}/read`,
    getReadReceipts: (messageId: string) => `${API_URL}/api/messages/${messageId}/read-receipts`,

    // Files
    uploadFile: (roomId: string) => `${API_URL}/files/upload?room_id=${roomId}`,

    // Sync
    sync: `${API_URL}/api/sync`,

    // Friends
    getFriends: `${API_URL}/api/friends/`,
    getFriendRequestsReceived: `${API_URL}/api/friends/requests/received`,
    getFriendRequestsSent: `${API_URL}/api/friends/requests/sent`,
    searchUsers: (query: string) => `${API_URL}/api/friends/search?query=${query}`,
    sendFriendRequest: (userId: string) => `${API_URL}/api/friends/request/${userId}`,
    respondFriendRequest: (requestId: string, action: 'accept' | 'reject') => `${API_URL}/api/friends/request/${requestId}/${action}`,

    // WebSocket
    wsChat: (token: string) => `${WS_BASE_URL}/ws/chat?token=${encodeURIComponent(token)}`,

    // System
    systemInfo: `${API_URL}/api/system/info`,

    // Notifications
    vapidKey: `${API_URL}/notifications/vapid-public-key`,
    subscribePush: `${API_URL}/notifications/subscribe`,
    testNotification: `${API_URL}/notifications/test`,
};

export interface ApiError {
    detail: string;
}

// Circuit breaker state
let consecutiveFailures = 0;
const MAX_FAILURES = 5;
const CIRCUIT_OPEN_DURATION = 30000; // 30 seconds
let circuitOpenUntil = 0;

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
    // Circuit breaker check
    if (Date.now() < circuitOpenUntil) {
        throw new Error('Service temporarily unavailable (circuit breaker open). Please try again later.');
    }

    const token = localStorage.getItem('access_token');

    const headers: any = {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
    };

    // Only set Content-Type to JSON if body is NOT FormData
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    // Add correlation ID for tracing
    const correlationId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    headers['X-Correlation-ID'] = correlationId;

    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000;
    const TIMEOUT_MS = 30000; // 30 second timeout

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                ...options,
                headers,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Success - reset circuit breaker
            if (response.ok) {
                consecutiveFailures = 0;
                return response.json();
            }

            // Server error - retry
            if (response.status >= 500 && attempt < MAX_RETRIES) {
                const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 1000; // Add jitter
                console.warn(`Request failed with ${response.status}, retrying in ${Math.round(delay)}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            // Client error or max retries - fail immediately
            const error: ApiError = await response.json().catch(() => ({
                detail: `HTTP ${response.status}: ${response.statusText}`
            }));

            // Don't count 4xx as circuit breaker failures (likely user errors)
            if (response.status >= 500) {
                consecutiveFailures++;
                if (consecutiveFailures >= MAX_FAILURES) {
                    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_DURATION;
                    console.error('Circuit breaker opened due to repeated failures');
                }
            }

            throw new Error(error.detail);

        } catch (err: any) {
            clearTimeout(timeoutId);

            // Timeout error
            if (err.name === 'AbortError') {
                if (attempt < MAX_RETRIES) {
                    const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 1000;
                    console.warn(`Request timeout, retrying in ${Math.round(delay)}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                consecutiveFailures++;
                if (consecutiveFailures >= MAX_FAILURES) {
                    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_DURATION;
                }
                throw new Error('Request timeout - server not responding');
            }

            // Network error - retry
            if (attempt < MAX_RETRIES && (err.message.includes('fetch') || err.message.includes('network'))) {
                const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 1000;
                console.warn(`Network error (${err.message}), retrying in ${Math.round(delay)}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            // Circuit breaker for network failures too
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_FAILURES) {
                circuitOpenUntil = Date.now() + CIRCUIT_OPEN_DURATION;
                console.error('Circuit breaker opened due to repeated failures');
            }

            throw err;
        }
    }

    throw new Error('Maximum retry attempts exceeded');
}
