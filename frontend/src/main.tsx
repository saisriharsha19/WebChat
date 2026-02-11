import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './style.css';

registerSW({ immediate: true });

// Configure React Query with aggressive caching
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 2 * 60 * 1000,  // 2 minutes - data is fresh
            gcTime: 5 * 60 * 1000,  // 5 minutes - keep in cache
            refetchOnWindowFocus: true,  // Refresh when tab regains focus
            refetchOnReconnect: true,  // Refresh when internet reconnects
            retry: 2,
        },
    },
});

ReactDOM.createRoot(document.getElementById('app')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </React.StrictMode>,
);
