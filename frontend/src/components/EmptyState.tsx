import { ReactNode } from 'react';

interface EmptyStateProps {
    icon?: ReactNode;
    heading: string;
    description?: string;
    actions?: ReactNode;
}

export function EmptyState({ icon, heading, description, actions }: EmptyStateProps) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="max-w-md w-full bg-surface border border-border rounded-xl p-8 text-center shadow-lg animate-fade-in">
                {icon && (
                    <div className="flex justify-center mb-6">
                        {icon}
                    </div>
                )}

                <h2 className="text-lg font-semibold text-txt-primary mb-2">
                    {heading}
                </h2>

                {description && (
                    <p className="text-sm text-txt-secondary mb-6 leading-relaxed">
                        {description}
                    </p>
                )}

                {actions && (
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}
