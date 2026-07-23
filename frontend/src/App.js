import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth, isAdmin } from "@/lib/auth";
import { BadgeProvider } from "@/lib/badgeContext";
import Layout from "@/components/Layout";
import AdminLayout from "@/components/AdminLayout";
import AdminRoute from "@/components/AdminRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import WorkflowsList from "@/pages/WorkflowsList";
import WorkflowBuilder from "@/pages/WorkflowBuilder";
import SimpleWorkflowBuilder from "@/pages/SimpleWorkflowBuilder";
import FormsList from "@/pages/FormsList";
import FormBuilder from "@/pages/FormBuilder";
import Inbox from "@/pages/Inbox";
import ProcessMonitoring from "@/pages/ProcessMonitoring";
import MobileApprovals from "@/pages/MobileApprovals";
import UserManagement from "@/pages/UserManagement";
import { ThemeProvider } from "@/lib/themeContext";
import Analytics from "@/pages/Analytics";
import OrgChart from "@/pages/OrgChart";
import "@/App.css";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm" data-testid="auth-loading">
        در حال بارگذاری…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function RedirectIfAuthed({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  // Redirect admins to their panel, other users to client panel
  if (user) return <Navigate to={isAdmin(user) ? "/admin" : "/"} replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* ─── Auth ─── */}
      <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />

      {/* ─── Mobile view (standalone) ─── */}
      <Route path="/mobile" element={<RequireAuth><MobileApprovals /></RequireAuth>} />

      {/* ─── Admin panel: /admin/* ─── */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="chat" element={<Chat />} />
        <Route path="workflows" element={<WorkflowsList />} />
        <Route path="workflows/:id" element={<WorkflowBuilder />} />
        <Route path="workflows/:id/simple" element={<SimpleWorkflowBuilder />} />
        <Route path="forms" element={<FormsList />} />
        <Route path="forms/:id" element={<FormBuilder />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="org-chart" element={<OrgChart />} />
        <Route path="monitoring" element={<ProcessMonitoring />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>

      {/* ─── Client panel: / ─── */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="monitoring" element={<ProcessMonitoring />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App" dir="rtl" lang="fa">
      <ThemeProvider>
        <AuthProvider>
          <BadgeProvider>
            <BrowserRouter>
              <AppRoutes />
              <Toaster position="top-center" dir="rtl" richColors />
            </BrowserRouter>
          </BadgeProvider>
        </AuthProvider>
      </ThemeProvider>
    </div>
  );
}
