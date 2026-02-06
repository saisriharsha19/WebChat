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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-[400px] bg-surface-sidebar border border-border rounded-[8px] shadow-2xl flex flex-col max-h-[85vh]">
                <div className="h-[52px] px-5 flex items-center justify-between border-b border-border">
                    <h2 className="text-[14px] font-semibold text-txt-primary">Create New Project</h2>
                    <button onClick={onClose} className="text-txt-tertiary hover:text-txt-primary">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="p-5 flex-1 overflow-hidden flex flex-col">
                    <div className="mb-4">
                        <label className="block text-[11px] font-semibold text-txt-secondary uppercase tracking-wider mb-1.5">Project Name</label>
                        <input
                            type="text"
                            className="saas-input w-full"
                            placeholder="e.g. Q4 Marketing"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col min-h-[200px]">
                        <label className="block text-[11px] font-semibold text-txt-secondary uppercase tracking-wider mb-1.5">Add Members</label>
                        <div className="flex-1 border border-border rounded-[6px] overflow-hidden p-2 bg-surface">
                            <UserList
                                onSelectUser={(uid) => {
                                    setMemberIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
                                }}
                                selectedUserIds={memberIds}
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-border bg-surface flex justify-end gap-3 rounded-b-[8px]">
                    <button onClick={onClose} className="saas-btn px-4 bg-transparent border border-border text-txt-secondary hover:text-txt-primary">Cancel</button>
                    <button onClick={create} className="saas-btn-primary" disabled={!name || memberIds.length === 0}>
                        Create Project
                    </button>
                </div>
            </div>
        </div>
    );
}
