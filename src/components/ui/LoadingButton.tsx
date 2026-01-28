import React from 'react';
import { Loader2 } from 'lucide-react';
import { themeColors } from '@/styles/colors';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    isLoading?: boolean;
    loadingText?: string;
    variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
    children,
    isLoading,
    loadingText,
    variant = 'primary',
    className = '',
    disabled,
    ...props
}) => {
    const baseStyles = "flex items-center justify-center py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm focus:outline-none focus:ring-2 focus:ring-offset-2";

    let variantStyles = themeColors.button.primary;
    if (variant === 'secondary') variantStyles = themeColors.button.secondary;
    if (variant === 'danger') variantStyles = "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500";
    if (variant === 'warning') variantStyles = "bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-yellow-500";
    if (variant === 'ghost') variantStyles = "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300";

    // Use a generic ring color for primary/secondary if not specific
    // themeColors.button.primary usually includes bg-blue-600 text-white, etc.

    return (
        <button
            disabled={disabled || isLoading}
            className={`${baseStyles} ${variantStyles} ${className}`}
            {...props}
        >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading && loadingText ? loadingText : children}
        </button>
    );
};
