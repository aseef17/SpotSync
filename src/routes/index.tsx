import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Login } from '@/features/auth/routes/Login';
import { Register } from '@/features/auth/routes/Register';
import { PrivateRoute } from '@/features/auth/components/PrivateRoute';

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
  <div className="min-h-screen flex items-center justify-center light-bg-app">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
  </div>
);

export const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register />} />

        <Route element={<PrivateRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/list/:listId" element={<ListView />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
      </Routes>
    </Suspense>
  );
};
