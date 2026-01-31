export type ToastType = 'success' | 'error' | 'info' | 'warning';
export type ToastPosition =
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number; // in ms, default 5000
}

export interface ToastContextType {
  addToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  position: ToastPosition;
  setPosition: (position: ToastPosition) => void;
}
