import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { Login } from '@/features/auth/routes/Login';
import { Register } from '@/features/auth/routes/Register';
import { PrivateRoute } from '@/features/auth/components/PrivateRoute';
import { Dashboard } from '@/features/lists/routes/Dashboard';
import { ListView } from '@/features/lists/routes/ListView';
import { Settings } from '@/features/auth/routes/Settings';

export const AppRoutes = () => {
  const { user } = useAuth();

  return (
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
  );
};
