import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/context/AuthContext';
import { VerifyEmail } from '@/features/auth/routes/VerifyEmail';
import { AppLoadingScreen } from '@/components/Layout/AppLoadingScreen';

interface PrivateRouteProps {
  children?: React.ReactNode;
}

export const PrivateRoute: React.FunctionComponent<PrivateRouteProps> = ({ children }) => {
  const { firebaseUser, loading, requiresEmailVerification } = useAuth();

  if (loading) {
    return (
      <AppLoadingScreen
        title="Loading your account"
        message="Restoring your session and profile..."
      />
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  if (requiresEmailVerification) {
    return <VerifyEmail />;
  }

  return children ? <>{children}</> : <Outlet />;
};
