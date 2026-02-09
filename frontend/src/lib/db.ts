import Dexie, { Table } from 'dexie';

// Define database interfaces
export interface User {
    id: string;
    username: string;
    email: string;
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    theme_preference: string;
    is_active: boolean;
    created_at: Date;
    last_seen: Date;
}

export interface FileAttachment {
    id: string;
    filename: string;
    file_path: string;
    file_size: number;
    content_type: string;
}

export interface Message {
    id?: string;
    content: string;
    sender_id: string;
    room_id: string;
    message_type: 'text' | 'image' | 'file' | 'system';
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
    is_edited?: boolean;
    status?: 'pending' | 'synced' | 'failed';
    temp_id?: string;
    sender?: User;
    attachments?: FileAttachment[];
    read_receipts?: ReadReceipt[];
}

export interface ReadReceipt {
    id?: string;
    message_id: string;
    user_id: string;
    read_at: Date;
}

export interface Room {
    id: string;
    name?: string;
    type: 'direct' | 'group';
    created_at: Date;
    created_by?: string;
    members?: any[];
}

// Define the database
export class WebChatDB extends Dexie {
    users!: Table<User, string>;
    messages!: Table<Message, string>;
    readReceipts!: Table<ReadReceipt, string>;
    rooms!: Table<Room, string>;

    constructor() {
        super('WebChatDB');

        this.version(1).stores({
            users: 'id, username, email', // Removed ++
            messages: 'id, room_id, sender_id, created_at, status, temp_id', // Removed ++
            readReceipts: 'id, message_id, user_id', // Removed ++
            rooms: 'id, room_type, created_by' // Removed ++ and fixed in v2/v3
        });

        this.version(2).stores({
            rooms: 'id, type, created_by'
        });

        // Version 3: Explicitly set string PKs if needed, though 'id' works for both. 
        // We just ensure we don't use auto-increment.
        this.version(3).stores({
            users: 'id, username, email',
            messages: 'id, room_id, sender_id, created_at, status, temp_id',
            readReceipts: 'id, message_id, user_id',
            rooms: 'id, type, created_by'
        });
    }
}

export const db = new WebChatDB();
