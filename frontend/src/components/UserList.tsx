import { useState, useEffect } from 'react';
import { fetchWithAuth, API_ENDPOINTS } from '../lib/api';
import { User } from '../types';

interface UserListProps {
    onSelectUser: (userId: number) => void;
    selectedUserIds?: number[];
}

export function UserList({ onSelectUser, selectedUserIds = [] }: UserListProps) {
    const [users, setUsers] = useState<User[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchWithAuth(API_ENDPOINTS.getUsers(search))
                .then(setUsers)
                .catch(console.error);
        }, 300); // 300ms debounce
        return () => clearTimeout(timeoutId);
    }, [search]);

    return (
        <div className="flex flex-col h-full p-2">
            <div className="mb-3 px-1">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Filter people..."
                        className="w-full bg-[#1a1d21] border border-[#2a2d32] rounded-[8px] pl-9 pr-3 py-2 text-xs text-[#ededef] placeholder:text-[#60646c] focus:border-[#5e6ad2] focus:ring-1 focus:ring-[#5e6ad2] transition-all"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <div className="absolute left-3 top-2 text-[#60646c]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                </div>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto pr-1 saas-scrollbar">
                {users.map(u => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                        <button
                            key={u.id}
                            onClick={() => onSelectUser(u.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-[8px] transition-all duration-200 group
                        ${isSelected
                                    ? 'bg-[#5e6ad2]/10 border border-[#5e6ad2]/20'
                                    : 'hover:bg-[#121417] border border-transparent'}
                    `}
                        >
                            <div className="relative">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors shadow-sm ${isSelected ? 'bg-[#5e6ad2] text-white' : 'bg-[#2a2d32] text-[#9da2ae] group-hover:bg-[#3f434a] group-hover:text-white'}`}>
                                    {u.display_name?.[0] || u.username[0]}
                                </div>
                                {u.is_active && (
                                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#0f1013] rounded-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 bg-[#2E9B48] rounded-full shadow-[0_0_4px_rgba(46,155,72,0.5)]"></div>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <div className={`text-[13px] font-medium truncate ${isSelected ? 'text-[#ededef]' : 'text-[#9da2ae] group-hover:text-[#ededef]'}`}>
                                    {u.display_name || u.username}
                                </div>
                            </div>
                            {isSelected && <div className="text-[#5e6ad2] text-[10px]">✓</div>}
                        </button>
                    );
                })}
                {users.length === 0 && (
                    <div className="text-center text-[#60646c] text-[12px] mt-4 italic">
                        No users found
                    </div>
                )}
            </div>
        </div>
    );
}
