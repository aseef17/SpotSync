import { Toaster } from 'sonner';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/features/auth/context/AuthContext';
import { NotificationProvider } from '@/features/notifications/context';
import { ThemeProvider } from '@/providers/ThemeContext';
import { ToastProvider } from '@/providers/ToastContext';
import { OfflineBanner } from '@/components/Layout/OfflineBanner';
import { PlaceDataMigrationBanner } from '@/components/Layout/PlaceDataMigrationBanner';
import { PlaceDataMigrationProvider } from '@/features/places/context/PlaceDataMigrationContext';
import { AppRoutes } from '@/routes';
import { ListsProvider } from '@/features/lists/context/ListsProvider';
import { InitialCacheHydrationProvider } from '@/context/InitialCacheHydrationContext';

function AppContent() {
  const { user } = useAuth();
  return (
    <InitialCacheHydrationProvider>
      <ListsProvider key={user?.id ?? 'anonymous'} userId={user?.id}>
        <AppRoutes />
      </ListsProvider>
    </InitialCacheHydrationProvider>
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
                <PlaceDataMigrationProvider>
                  <PlaceDataMigrationBanner />
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
                </PlaceDataMigrationProvider>
              </div>
            </ThemeProvider>
          </NotificationProvider>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
