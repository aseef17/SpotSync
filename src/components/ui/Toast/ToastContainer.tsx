import React from 'react';
import { createPortal } from 'react-dom';
import type { ToastMessage, ToastPosition } from '@/types/toast';
import { Toast } from '@/components/ui/Toast/Toast';

interface ToastContainerProps {
    toasts: ToastMessage[];
    removeToast: (id: string) => void;
    position: ToastPosition;
}

const positions = {
    'top-left': 'top-0 left-0',
    'top-right': 'top-0 right-0',
    'top-center': 'top-0 left-1/2 -translate-x-1/2',
    'bottom-left': 'bottom-0 left-0',
    'bottom-right': 'bottom-0 right-0',
    'bottom-center': 'bottom-0 left-1/2 -translate-x-1/2',
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast, position }) => {
    return createPortal(
        <div
            className={`fixed z-50 p-4 gap-4 flex flex-col ${positions[position]} pointer-events-none max-h-screen overflow-hidden`}
        >
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} removeToast={removeToast} />
            ))}
        </div>,
        document.body
    );
};
