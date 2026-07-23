import { Navigate, useLocation } from "react-router-dom";
import { useAuth, isAdmin } from "@/lib/auth";

/**
 * AdminRoute – protects admin-only routes.
 * - If auth is loading, shows a spinner.
 * - If the user is not logged in, redirects to /login.
 * - If the user is logged in but is NOT an admin, redirects to /.
 * - Otherwise renders children.
 */
export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-muted-foreground text-sm"
        data-testid="auth-loading"
      >
        در حال بارگذاری…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAdmin(user)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
