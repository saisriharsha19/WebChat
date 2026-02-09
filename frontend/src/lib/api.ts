/// <reference types="vite/client" />
export const API_URL = 'https://webchat-8bvf.onrender.com';
const WS_BASE_URL = 'wss://webchat-8bvf.onrender.com';

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
};

export interface ApiError {
    detail: string;
}

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem('access_token');

    const headers: any = {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
    };

    // Only set Content-Type to JSON if body is NOT FormData
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            // If successful or client error (4xx), return immediately (don't retry 4xx except maybe 408/429 but keeping simple)
            // Retry on server errors (5xx)
            if (response.ok) {
                return response.json();
            }

            if (response.status >= 500 && attempt < MAX_RETRIES) {
                // Server error, retry
                const delay = BASE_DELAY * Math.pow(2, attempt);
                console.warn(`Request failed with ${response.status}, retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }

            // If we are here, it's an error we shouldn't retry or we ran out of retries
            const error: ApiError = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
            throw new Error(error.detail);

        } catch (err: any) {
            // Network errors (fetch failed entirely) should be retried
            if (attempt < MAX_RETRIES) {
                const delay = BASE_DELAY * Math.pow(2, attempt);
                console.warn(`Network request failed (${err.message}), retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
}
