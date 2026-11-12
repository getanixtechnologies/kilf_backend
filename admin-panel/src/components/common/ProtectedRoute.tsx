import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

// Checkers (SCANNER role) only get the checker dashboard and their own profile.
const SCANNER_PATHS = ['/check-in', '/admin/profile'];
const CHANGE_PASSWORD_PATH = '/change-password';

export function ProtectedRoute() {
  const { admin, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // A temporary password must be replaced before anything else.
  if (admin?.mustChangePassword) {
    return location.pathname === CHANGE_PASSWORD_PATH ? <Outlet /> : <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }

  if (
    admin?.role === 'SCANNER' &&
    location.pathname !== CHANGE_PASSWORD_PATH &&
    !SCANNER_PATHS.some((p) => location.pathname === p)
  ) {
    return <Navigate to="/check-in" replace />;
  }

  return <Outlet />;
}
