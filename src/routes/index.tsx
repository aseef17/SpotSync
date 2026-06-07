import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Login } from '@/features/auth/routes/Login';
import { Register } from '@/features/auth/routes/Register';
import { PrivateRoute } from '@/features/auth/components/PrivateRoute';
import { AppLoadingScreen } from '@/components/Layout/AppLoadingScreen';

const Dashboard = lazy(() =>
  import('@/features/lists/routes/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const ListView = lazy(() =>
  import('@/features/lists/routes/ListView').then((m) => ({ default: m.ListView }))
);
const Settings = lazy(() =>
  import('@/features/auth/routes/Settings').then((m) => ({ default: m.Settings }))
);

const RouteFallback = () => (
  <AppLoadingScreen title="Loading page" message="Fetching the latest view..." showRetry={false} />
);

export const AppRoutes = () => {
  const { user, requiresEmailVerification } = useAuth();
  const canAccessApp = user && !requiresEmailVerification;

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={canAccessApp ? <Navigate to="/dashboard" /> : <Login />} />
        <Route
          path="/register"
          element={canAccessApp ? <Navigate to="/dashboard" /> : <Register />}
        />

        <Route element={<PrivateRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/list/:listId" element={<ListView />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="/" element={<Navigate to={canAccessApp ? '/dashboard' : '/login'} />} />
      </Routes>
    </Suspense>
  );
};
