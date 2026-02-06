import { useState, useEffect } from 'react';
import { fetchWithAuth, API_ENDPOINTS } from '../lib/api';
import { useAuth } from '../AuthContext';
import { User, Room } from '../types';

interface RoomListProps {
    currentRoomId: number | null;
    onSelectRoom: (roomId: number) => void;
    onNewDM: () => void;
    onNewGroup: () => void;
}

export function RoomList({ currentRoomId, onSelectRoom, onNewDM, onNewGroup }: RoomListProps) {
    const [rooms, setRooms] = useState<Room[]>([]);

    useEffect(() => {
        loadRooms();
        const interval = setInterval(loadRooms, 5000);
        return () => clearInterval(interval);
    }, []);

    const loadRooms = async () => {
        try {
            const data = await fetchWithAuth(API_ENDPOINTS.getRooms);
            setRooms(data);
        } catch (e) {
            console.error("Failed to load rooms", e);
        }
    };

    const dms = rooms.filter(r => r.type === 'direct');
    const groups = rooms.filter(r => r.type === 'group');

    const { user } = useAuth(); // Need to access current user to filter

    const getDMName = (room: Room) => {
        if (!room.members || room.members.length === 0) return 'Unknown';

        // Filter out self
        const others = room.members.filter(m => Number(m.user_id) !== Number(user?.id));

        if (others.length === 0) {
            // Self-dm or logic error, fallback to first member
            const m = room.members[0];
            return `${m.user.display_name || m.user.username} (You)`;
        }

        return others.map(m => m.user.display_name || m.user.username).join(', ');
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto px-2 py-4 space-y-6">

            {/* Search / Filter (Placeholder) */}
            <div className="px-2 mb-2">
                <button className="w-full text-left bg-[#1a1d21] border border-[#2a2d32] rounded-[6px] px-3 py-1.5 text-xs text-[#9da2ae] hover:border-[#3f434a] transition-colors">
                    Find or start a conversation...
                </button>
            </div>

            {/* Groups */}
            <div className="space-y-0.5">
                <div className="flex items-center justify-between px-3 mb-1 group">
                    <h3 className="text-[11px] font-semibold text-[#60646c] uppercase tracking-wider">Projects & Groups</h3>
                    <button onClick={onNewGroup} className="text-[#60646c] hover:text-[#ededef] opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                </div>
                {groups.map(room => (
                    <button
                        key={room.id}
                        onClick={() => onSelectRoom(room.id)}
                        className={`w-full text-left px-3 py-1.5 rounded-[4px] text-[13px] font-medium transition-all flex items-center gap-2.5
              ${currentRoomId === room.id
                                ? 'bg-[#1e2124] text-[#ededef]'
                                : 'text-[#9da2ae] hover:bg-[#121417] hover:text-[#ededef]'}`}
                    >
                        <span className="text-[#60646c]">#</span>
                        <span className="truncate">{room.name || 'Unnamed'}</span>
                    </button>
                ))}
                {groups.length === 0 && <div className="px-3 text-[11px] text-[#60646c] italic">No projects yet</div>}
            </div>

            {/* DMs */}
            <div className="space-y-0.5">
                <div className="flex items-center justify-between px-3 mb-1 group">
                    <h3 className="text-[11px] font-semibold text-[#60646c] uppercase tracking-wider">Direct Messages</h3>
                    <button onClick={onNewDM} className="text-[#60646c] hover:text-[#ededef] opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                </div>
                {dms.map(room => (
                    <button
                        key={room.id}
                        onClick={() => onSelectRoom(room.id)}
                        className={`w-full text-left px-3 py-1.5 rounded-[4px] text-[13px] font-medium transition-all flex items-center gap-2.5
                ${currentRoomId === room.id
                                ? 'bg-[#5e6ad2] text-white shadow-md shadow-[#5e6ad2]/10'
                                : 'text-[#9da2ae] hover:bg-[#121417] hover:text-[#ededef]'}`}
                    >
                        <div className={`w-2 h-2 rounded-full ${currentRoomId === room.id ? 'bg-white' : 'bg-[#2E9B48]'}`}></div>
                        <span className="truncate">{getDMName(room)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
