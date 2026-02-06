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
        <div className="flex flex-col h-full p-3">
            <div className="mb-4 px-1">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Filter people..."
                        className="w-full bg-[#18181b] border border-[#3f3f46] rounded-[8px] pl-9 pr-3 py-2.5 text-[13px] text-[#fafafa] placeholder:text-[#71717a] focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1] transition-all shadow-sm"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <div className="absolute left-3 top-2.5 text-[#71717a]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                </div>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto pr-1 saas-scrollbar">
                {users.map(u => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                        <button
                            key={u.id}
                            onClick={() => onSelectUser(u.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] transition-all duration-200 group hover:scale-[1.01] touch-target
                        ${isSelected
                                    ? 'bg-[#6366f1]/10 border border-[#6366f1]/20 shadow-sm'
                                    : 'hover:bg-[#111113] border border-transparent'}
                    `}
                        >
                            <div className="relative">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold transition-colors shadow-sm border ${isSelected ? 'bg-[#6366f1] text-white border-[#6366f1]' : 'bg-[#3f3f46] text-[#a1a1aa] border-[#3f3f46] group-hover:bg-[#52525b] group-hover:text-white'}`}>
                                    {u.display_name?.[0] || u.username[0]}
                                </div>
                                {u.is_active && (
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#0d0d0e] rounded-full flex items-center justify-center">
                                        <div className="w-2 h-2 bg-[#22c55e] rounded-full shadow-[0_0_4px_rgba(34,197,94,0.5)] animate-pulse"></div>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <div className={`text-[14px] font-medium truncate ${isSelected ? 'text-[#fafafa]' : 'text-[#a1a1aa] group-hover:text-[#fafafa]'}`}>
                                    {u.display_name || u.username}
                                </div>
                                <div className="text-[11px] text-[#71717a] truncate">@{u.username}</div>
                            </div>
                            {isSelected && <div className="text-[#6366f1] text-sm">✓</div>}
                        </button>
                    );
                })}
                {users.length === 0 && (
                    <div className="text-center text-[#71717a] text-[13px] mt-8 py-4">
                        <div className="mb-2 opacity-50">👤</div>
                        <div>No users found</div>
                    </div>
                )}
            </div>
        </div>
    );
}
