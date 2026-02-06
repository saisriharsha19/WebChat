import { useState, useRef } from 'react';
import { fetchWithAuth, API_ENDPOINTS } from '../lib/api';

interface FileUploaderProps {
    roomId: number;
    onUploadStart?: () => void;
    onUploadComplete?: (fileId: number) => void;
    onUploadError?: (error: string) => void;
}

export function FileUploader({ roomId, onUploadStart, onUploadComplete, onUploadError }: FileUploaderProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleFile = async (file: File) => {
        if (!file) return;
        setUploading(true);
        onUploadStart?.();

        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetchWithAuth(API_ENDPOINTS.uploadFile(roomId), {
                method: 'POST',
                body: formData,
            });
            onUploadComplete?.(res.file_id);
        } catch (e: any) {
            onUploadError?.(e.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={`p-1 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors ${uploading ? 'animate-pulse text-accent' : ''}`}
                title="Attach File"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
            </button>
        </>
    );
}
