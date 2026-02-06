import { useState, useEffect } from 'react';
import { fetchWithAuth, API_ENDPOINTS } from '../lib/api';
import { User } from '../types';

interface UserListProps {
    onSelectUser: (userId: number) => void;
    selectedUserIds?: number[];
    multiSelect?: boolean;
}

export function UserList({ onSelectUser, selectedUserIds = [], multiSelect = false }: UserListProps) {
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
        <div className="flex flex-col h-full">
            <div className="mb-3">
                <input
                    type="text"
                    placeholder="Filter people..."
                    className="w-full bg-surface-root border border-border rounded-[4px] px-2 py-1.5 text-[13px] text-txt-primary focus:border-accent focus:outline-none placeholder:text-txt-tertiary"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            <div className="flex-1 space-y-1">
                {users.map(u => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                        <button
                            key={u.id}
                            onClick={() => onSelectUser(u.id)}
                            className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-[4px] transition-colors
                        ${isSelected ? 'bg-accent/10 border border-accent/20' : 'hover:bg-surface-hover'}
                    `}
                        >
                            <div className="relative">
                                <div className="w-7 h-7 rounded-[4px] bg-surface border border-border flex items-center justify-center text-[10px] font-bold text-txt-secondary">
                                    {u.display_name?.[0] || u.username[0]}
                                </div>
                                {u.is_active && (
                                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-surface-sidebar rounded-full flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <div className="text-[13px] font-medium text-txt-primary truncate">
                                    {u.display_name || u.username}
                                </div>
                            </div>
                            {isSelected && <div className="text-accent text-[10px]">✓</div>}
                        </button>
                    );
                })}
                {users.length === 0 && (
                    <div className="text-center text-txt-tertiary text-[12px] mt-4">
                        No users found
                    </div>
                )}
            </div>
        </div>
    );
}
