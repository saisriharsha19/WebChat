import { useEffect } from 'react';
import { UserList } from './UserList';

interface DirectoryModalProps {
    onClose: () => void;
    onSelectUser: (userId: number) => void;
}

export function DirectoryModal({ onClose, onSelectUser }: DirectoryModalProps) {
    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-surface-sidebar border border-border rounded-xl shadow-2xl animate-fade-in flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="h-[48px] px-4 flex items-center justify-between border-b border-border shrink-0">
                    <span className="text-sm font-semibold text-txt-primary">New Direct Message</span>
                    <button
                        onClick={onClose}
                        className="text-txt-tertiary hover:text-txt-primary transition-colors p-1 rounded hover:bg-surface-hover"
                        aria-label="Close"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                    <UserList onSelectUser={onSelectUser} />
                </div>
            </div>
        </div>
    );
}
