import { useState } from 'react';
import { UserList } from './UserList';
import { fetchWithAuth, API_ENDPOINTS } from '../lib/api';

interface CreateGroupModalProps {
    onClose: () => void;
    onCreated: (group: any) => void;
}

export function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
    const [name, setName] = useState('');
    const [memberIds, setMemberIds] = useState<number[]>([]);

    const create = async () => {
        if (!name || memberIds.length === 0) return;
        try {
            const res = await fetchWithAuth(API_ENDPOINTS.createGroup, {
                method: 'POST',
                body: JSON.stringify({ name, member_ids: memberIds, type: 'group' })
            });
            onCreated(res);
            onClose();
        } catch (e) {
            alert('Failed');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-[420px] bg-[#111113] border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up">
                <div className="h-[56px] px-5 flex items-center justify-between border-b border-white/5">
                    <h2 className="text-[15px] font-semibold text-white">Create New Project</h2>
                    <button onClick={onClose} className="text-txt-tertiary hover:text-white transition-colors p-1 hover:bg-white/5 rounded-full">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="p-5 flex-1 overflow-hidden flex flex-col gap-5">
                    <div>
                        <label className="block text-[11px] font-bold text-txt-tertiary uppercase tracking-wider mb-2 ml-1">Project Name</label>
                        <input
                            type="text"
                            className="w-full bg-[#0a0a0b] border border-[#3f3f46] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-txt-tertiary focus:border-[#6366f1] focus:outline-none focus:ring-1 focus:ring-[#6366f1]/50 transition-all"
                            placeholder="e.g. Q4 Marketing"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col min-h-[200px]">
                        <label className="block text-[11px] font-bold text-txt-tertiary uppercase tracking-wider mb-2 ml-1">Add Members</label>
                        <div className="flex-1 border border-[#3f3f46] rounded-lg overflow-hidden p-1 bg-[#0a0a0b]">
                            <UserList
                                onSelectUser={(uid) => {
                                    setMemberIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
                                }}
                                selectedUserIds={memberIds}
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-white/5 bg-[#111113] flex justify-end gap-3 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-transparent border border-white/10 text-txt-secondary hover:text-white hover:bg-white/5 rounded-lg text-sm font-medium transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={create}
                        className="px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6366f1]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        disabled={!name || memberIds.length === 0}
                    >
                        Create Project
                    </button>
                </div>
            </div>
        </div>
    );
}
