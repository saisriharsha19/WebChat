export interface User {
    id: number;
    username: string;
    email: string;
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    theme_preference: string;
    is_active: boolean;
    last_seen: string;
}

export interface RoomMember {
    user_id: number;
    role: 'admin' | 'member';
    joined_at: string;
    user: User;
}

export interface Room {
    id: number;
    name?: string;
    type: 'direct' | 'group';
    created_at: string;
    created_by?: number;
    members: RoomMember[];
}

export interface FileAttachment {
    id: number;
    filename: string;
    file_path: string;
    file_size: number;
    content_type: string;
    uploaded_at: string;
}

export interface Message {
    id: number;
    content?: string;
    sender_id: number;
    room_id: number;
    message_type: 'text' | 'image' | 'file' | 'system';
    created_at: string;
    updated_at?: string;
    is_deleted: boolean;
    is_edited: boolean;
    attachments: FileAttachment[];
    sender: User;
}

export interface FriendRequest {
    id: number;
    sender_id: number;
    receiver_id: number;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: string;
    sender?: User;
    receiver?: User;
}

export interface UserWithStatus extends User {
    status?: 'online' | 'offline';
    friendship_status?: 'friend' | 'pending_sent' | 'pending_received' | 'none';
}
