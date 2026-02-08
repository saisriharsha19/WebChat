import { ReactNode } from 'react';

interface EmptyStateProps {
    icon?: ReactNode;
    heading: string;
    description?: string;
    actions?: ReactNode;
}

export function EmptyState({ icon, heading, description, actions }: EmptyStateProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-surface-root relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/5 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="max-w-md w-full relative z-10 flex flex-col items-center text-center animate-fade-in">
                {icon && (
                    <div className="mb-8 p-6 bg-surface-hover/50 rounded-3xl border border-white/5 shadow-2xl backdrop-blur-sm">
                        {icon}
                    </div>
                )}

                <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
                    {heading}
                </h2>

                {description && (
                    <p className="text-txt-secondary mb-10 text-base leading-relaxed max-w-sm mx-auto">
                        {description}
                    </p>
                )}

                {actions && (
                    <div className="w-full">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}
