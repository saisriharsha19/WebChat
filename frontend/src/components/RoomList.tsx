import { useState, useEffect } from 'react';
import { fetchWithAuth, API_ENDPOINTS } from '../lib/api';
import { useAuth } from '../AuthContext';
import { Room } from '../types';

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

            {/* Search */}
            <div className="px-2 mb-2">
                <div className="relative">
                    <input
                        className="w-full bg-[#1a1d21] border border-[#2a2d32] rounded-[8px] pl-9 pr-3 py-2 text-xs text-[#ededef] placeholder:text-[#60646c] focus:border-[#5e6ad2] focus:ring-1 focus:ring-[#5e6ad2] transition-all"
                        placeholder="Find groups or people..."
                    />
                    <div className="absolute left-3 top-2 text-[#60646c]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                </div>
            </div>

            {/* Groups */}
            <div className="space-y-1">
                <div className="flex items-center justify-between px-3 mb-2 group">
                    <h3 className="text-[11px] font-bold text-[#60646c] uppercase tracking-wider">Groups</h3>
                    <button onClick={onNewGroup} className="text-[#60646c] hover:text-[#ededef] hover:bg-white/10 p-1 rounded transition-all" title="Create Group">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                </div>
                {groups.map(room => (
                    <button
                        key={room.id}
                        onClick={() => onSelectRoom(room.id)}
                        className={`w-full text-left px-3 py-2 rounded-[8px] text-[13px] font-medium transition-all duration-200 flex items-center gap-3 group
                              ${currentRoomId === room.id
                                ? 'bg-[#5e6ad2]/10 text-[#ededef] border border-[#5e6ad2]/20'
                                : 'text-[#9da2ae] border border-transparent hover:bg-[#121417] hover:text-[#ededef]'}`}
                    >
                        <div className={`w-5 h-5 rounded-[4px] flex items-center justify-center text-[10px] font-bold transition-colors ${currentRoomId === room.id ? 'bg-[#5e6ad2] text-white' : 'bg-[#2a2d32] text-[#9da2ae] group-hover:bg-[#3f434a]'}`}>
                            #
                        </div>
                        <span className="truncate flex-1">{room.name || 'Unnamed'}</span>
                    </button>
                ))}
                {groups.length === 0 && <div className="px-3 text-[11px] text-[#60646c] italic">No projects yet</div>}
            </div>

            {/* DMs */}
            <div className="space-y-1">
                <div className="flex items-center justify-between px-3 mb-2 group">
                    <h3 className="text-[11px] font-bold text-[#60646c] uppercase tracking-wider">Messages</h3>
                    <button onClick={onNewDM} className="text-[#60646c] hover:text-[#ededef] hover:bg-white/10 p-1 rounded transition-all" title="New Message">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                </div>
                {dms.map(room => (
                    <button
                        key={room.id}
                        onClick={() => onSelectRoom(room.id)}
                        className={`w-full text-left px-3 py-2 rounded-[8px] text-[13px] font-medium transition-all duration-200 flex items-center gap-3
                                ${currentRoomId === room.id
                                ? 'bg-[#5e6ad2] text-white shadow-lg shadow-[#5e6ad2]/20'
                                : 'text-[#9da2ae] hover:bg-[#121417] hover:text-[#ededef]'}`}
                    >
                        <div className="relative">
                            <div className={`w-2 h-2 rounded-full ${currentRoomId === room.id ? 'bg-white' : 'bg-[#2E9B48]'}`}></div>
                        </div>
                        <span className="truncate flex-1">{getDMName(room)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
