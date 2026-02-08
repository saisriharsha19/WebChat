import { useRegisterSW } from 'virtual:pwa-register/react'

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

    const close = () => {
        setOfflineReady(false)
        setNeedRefresh(false)
    }

    return (
        <div className="ReloadPrompt-container">
            {(offlineReady || needRefresh) && (
                <div className="fixed bottom-5 right-5 z-[100] p-4 bg-surface-sidebar border border-border rounded-lg shadow-xl flex flex-col gap-2 animate-slide-up max-w-[300px]">
                    <div className="text-sm text-txt-primary font-medium">
                        {offlineReady
                            ? 'App ready to work offline'
                            : 'New content available, click on reload button to update.'}
                    </div>
                    <div className="flex gap-2 justify-end mt-1">
                        {needRefresh && (
                            <button
                                className="px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded hover:bg-accent-hover transition-colors"
                                onClick={() => updateServiceWorker(true)}
                            >
                                Reload
                            </button>
                        )}
                        <button
                            className="px-3 py-1.5 bg-transparent border border-border text-txt-secondary text-xs rounded hover:text-white transition-colors"
                            onClick={close}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
