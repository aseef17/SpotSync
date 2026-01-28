import React, { useState, useCallback, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ToastMessage, ToastPosition, ToastType } from '@/types/toast';
import { ToastContainer } from '@/components/ui/Toast/ToastContainer';
import { ToastContext } from '@/providers/toast-context';

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [position, setPosition] = useState<ToastPosition>('top-right');

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const addToast = useCallback((type: ToastType, message: string, title?: string, duration = 5000) => {
        const id = uuidv4();
        const newToast: ToastMessage = { id, type, message, title, duration };

        setToasts((prev) => [...prev, newToast]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ addToast, removeToast, position, setPosition }}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} position={position} />
        </ToastContext.Provider>
    );
};


