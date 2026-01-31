import { Toaster } from 'sonner';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/context/AuthContext';
import { NotificationProvider } from '@/features/notifications/context';
import { ThemeProvider } from '@/providers/ThemeContext';
import { ToastProvider } from '@/providers/ToastContext';
import { ThemeLoader } from '@/components/Elements/Theme/ThemeLoader';
import { AppRoutes } from '@/routes';

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <NotificationProvider>
            <ThemeProvider>
              <div className="min-h-screen light-bg-app transition-colors">
                <ThemeLoader />
                <Toaster position="top-center" richColors />
                <AppRoutes />
              </div>
            </ThemeProvider>
          </NotificationProvider>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
