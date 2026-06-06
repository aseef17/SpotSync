import { Toaster } from 'sonner';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/features/auth/context/AuthContext';
import { NotificationProvider } from '@/features/notifications/context';
import { ThemeProvider } from '@/providers/ThemeContext';
import { ToastProvider } from '@/providers/ToastContext';
import { ThemeLoader } from '@/components/Elements/Theme/ThemeLoader';
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
              <div className="min-h-screen light-bg-app transition-colors">
                <ThemeLoader />
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
                <AppContent />
              </div>
            </ThemeProvider>
          </NotificationProvider>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
