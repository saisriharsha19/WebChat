import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'

export function ReloadPrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r)
        },
        onRegisterError(error) {
            console.log('SW registration error', error)
        },
    })

    // Auto-update logic: if needRefresh is true, just update immediately
    useEffect(() => {
        if (needRefresh) {
            console.log("New content available, auto-updating...");
            updateServiceWorker(true);
        }
    }, [needRefresh, updateServiceWorker]);

    const close = () => {
        setOfflineReady(false)
        setNeedRefresh(false)
    }

    // We only show "Offline Ready" toaster now, hiding the reload prompt since it auto-reloads
    if (!offlineReady) return null;

    return (
        <div className="ReloadPrompt-container">
            <div className="fixed bottom-5 right-5 z-[100] p-4 bg-surface-sidebar border border-border rounded-lg shadow-xl flex flex-col gap-2 animate-slide-up max-w-[300px]">
                <div className="text-sm text-txt-primary font-medium">
                    App ready to work offline
                </div>
                <div className="flex gap-2 justify-end mt-1">
                    <button
                        className="px-3 py-1.5 bg-transparent border border-border text-txt-secondary text-xs rounded hover:text-white transition-colors"
                        onClick={close}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
