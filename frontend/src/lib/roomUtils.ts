// Use a looser type for input to handle both API (string dates) and Dexie (Date objects)
export function getRoomName(room: any, currentUserId: string | undefined): string {
    if (!room) return 'Chat';

    if (room.type === 'group') {
        return room.name || 'Unnamed Group';
    }

    if (room.type === 'direct') {
        if (!room.members || room.members.length === 0) return 'Unknown';

        // Filter out self
        const others = room.members.filter((m: any) => m.user_id !== currentUserId);

        if (others.length === 0) {
            // Self-dm or logic error, fallback to first member
            const m = room.members[0];
            return `${m.user?.display_name || m.user?.username || 'Unknown'} (You)`;
        }

        return others.map((m: any) => m.user?.display_name || m.user?.username || 'Unknown').join(', ');
    }

    return 'Chat';
}
