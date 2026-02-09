export interface User {
    id: string;
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
    user_id: string;
    role: 'admin' | 'member';
    joined_at: string;
    user: User;
}

export interface Room {
    id: string;
    name?: string;
    type: 'direct' | 'group';
    created_at: string;
    created_by?: string;
    members: RoomMember[];
}

export interface FileAttachment {
    id: string;
    filename: string;
    file_path: string;
    file_size: number;
    content_type: string;
    uploaded_at: string;
}

export interface ReadReceipt {
    id: string;
    message_id: string;
    user_id: string;
    read_at: string;
}

export interface Message {
    id: string;
    content?: string;
    sender_id: string;
    room_id: string;
    message_type: 'text' | 'image' | 'file' | 'system';
    created_at: string;
    updated_at?: string;
    is_deleted: boolean;
    is_edited: boolean;
    attachments: FileAttachment[];
    read_receipts: ReadReceipt[];
    sender: User;
}

export interface FriendRequest {
    id: string;
    sender_id: string;
    receiver_id: string;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: string;
    sender?: User;
    receiver?: User;
}

export interface UserWithStatus extends User {
    status?: 'online' | 'offline';
    friendship_status?: 'friend' | 'pending_sent' | 'pending_received' | 'none';
}
