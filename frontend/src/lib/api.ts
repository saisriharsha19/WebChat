/// <reference types="vite/client" />
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export const API_ENDPOINTS = {
    // Auth
    register: `${API_URL}/auth/register`,
    login: `${API_URL}/auth/login`,
    logout: `${API_URL}/auth/logout`,
    me: `${API_URL}/auth/me`,

    // Users
    getUser: (userId: number) => `${API_URL}/api/users/${userId}`,
    getUsers: (search?: string) => `${API_URL}/api/users${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    updateProfile: `${API_URL}/api/users/me/profile`,

    // Rooms
    getRooms: `${API_URL}/rooms/`,
    createDM: (userId: number) => `${API_URL}/rooms/dm?target_user_id=${userId}`,
    createGroup: `${API_URL}/rooms/group`,

    // Messages
    getMessages: (roomId: number, skip = 0, limit = 50) =>
        `${API_URL}/api/messages?room_id=${roomId}&skip=${skip}&limit=${limit}`,
    editMessage: (id: number) => `${API_URL}/messages/${id}`,
    markRead: (messageId: number) => `${API_URL}/api/messages/${messageId}/read`,
    getReadReceipts: (messageId: number) => `${API_URL}/api/messages/${messageId}/read-receipts`,

    // Files
    uploadFile: (roomId: number) => `${API_URL}/files/upload?room_id=${roomId}`,

    // Sync
    sync: `${API_URL}/api/sync`,

    // WebSocket
    wsChat: (token: string) => `${WS_BASE_URL}/ws/chat?token=${encodeURIComponent(token)}`,
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

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail);
    }

    return response.json();
}
