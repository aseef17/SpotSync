import React from 'react';
import { Plus } from 'lucide-react';

interface FABProps {
    onClick: () => void;
    icon?: React.ReactNode;
    label?: string;
}

export const FAB: React.FC<FABProps> = ({ onClick, icon = <Plus className="h-6 w-6" />, label }) => {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center z-40 active:scale-95"
            aria-label={label || 'Add'}
        >
            {icon}
        </button>
    );
};
