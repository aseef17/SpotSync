import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { AppLoadingScreen } from '@/components/Layout/AppLoadingScreen';

interface PrivateRouteProps {
  children?: React.ReactNode;
}

export const PrivateRoute: React.FunctionComponent<PrivateRouteProps> = ({ children }) => {
  const { firebaseUser, loading } = useAuth();

  if (loading && !firebaseUser) {
    return (
      <AppLoadingScreen
        title="Signing you in..."
        message="Please wait while we load your account."
      />
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
