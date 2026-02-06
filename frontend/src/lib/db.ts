import Dexie, { Table } from 'dexie';

// Define database interfaces
export interface User {
    id: number;
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
    id: number;
    filename: string;
    file_path: string;
    file_size: number;
    content_type: string;
}

export interface Message {
    id?: number;
    content: string;
    sender_id: number;
    room_id: number; // Changed to number
    message_type: 'text' | 'image' | 'file' | 'system';
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
    is_edited?: boolean; // Added
    status?: 'pending' | 'synced' | 'failed';
    temp_id?: string;
    sender?: User;
    attachments?: FileAttachment[]; // Added
}

export interface ReadReceipt {
    id?: number;
    message_id: number;
    user_id: number;
    read_at: Date;
}

export interface Room {
    id: number; // Changed to number
    name?: string;
    type: 'direct' | 'group'; // Changed from room_type
    created_at: Date;
    created_by?: number;
    members?: any[];
}

// Define the database
export class WebChatDB extends Dexie {
    users!: Table<User, number>;
    messages!: Table<Message, number>;
    readReceipts!: Table<ReadReceipt, number>;
    rooms!: Table<Room, number>;

    constructor() {
        super('WebChatDB');

        this.version(1).stores({
            users: '++id, username, email',
            messages: '++id, room_id, sender_id, created_at, status, temp_id',
            readReceipts: '++id, message_id, user_id',
            rooms: 'id, room_type, created_by'
        });

        // Version 2: Ensure room_id is indexed correctly (it's same string, but we use numbers now)
        // We can keep the same schema string as indexes are type-agnostic usually, 
        // but let's be explicit if we want to change primary keys or add new indices.
        this.version(2).stores({
            rooms: 'id, type, created_by' // Changed room_type to type to match backend
        });
    }
}

export const db = new WebChatDB();
