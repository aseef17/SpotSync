import { Toaster } from 'sonner';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/features/auth/context/AuthContext';
import { NotificationProvider } from '@/features/notifications/context';
import { ThemeProvider } from '@/providers/ThemeContext';
import { ToastProvider } from '@/providers/ToastContext';
import { ThemeLoader } from '@/components/Elements/Theme/ThemeLoader';
import { OfflineBanner } from '@/components/Layout/OfflineBanner';
import { AppRoutes } from '@/routes';
import { ListsProvider } from '@/features/lists/context/ListsProvider';

function AppContent() {
  const { user } = useAuth();
  return (
    <ListsProvider userId={user?.id}>
      <AppRoutes />
    </ListsProvider>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <NotificationProvider>
            <ThemeProvider>
              <div className="flex min-h-screen flex-col light-bg-app transition-colors">
                <OfflineBanner />
                <ThemeLoader />
                <OfflineBanner />
                <Toaster
                  position="top-center"
                  richColors
                  toastOptions={{
                    classNames: {
                      actionButton:
                        '!bg-transparent !border !border-current !text-inherit hover:!bg-black/5 dark:hover:!bg-white/10 transition-colors',
                    },
                  }}
                />
                <div className="flex min-h-0 flex-1 flex-col">
                  <AppContent />
                </div>
              </div>
            </ThemeProvider>
          </NotificationProvider>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
