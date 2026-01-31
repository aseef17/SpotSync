import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { themeColors } from '@/styles/colors';

interface PrivateRouteProps {
  children?: React.ReactNode;
}

export const PrivateRoute: React.FunctionComponent<PrivateRouteProps> = ({ children }) => {
  const { firebaseUser, loading } = useAuth();

  if (loading) {
    return (
      <div
        className={`min-h-screen ${themeColors.background.app} flex items-center justify-center`}
      >
        <div
          className={`animate-spin rounded-full h-32 w-32 border-b-2 ${themeColors.text.primary}`}
        ></div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
