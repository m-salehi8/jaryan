import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { BadgeProvider } from "@/lib/badgeContext";
import Layout from "@/components/Layout";
import CommandPalette from "@/components/CommandPalette";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import WorkflowsList from "@/pages/WorkflowsList";
import WorkflowBuilder from "@/pages/WorkflowBuilder";
import FormsList from "@/pages/FormsList";
import FormBuilder from "@/pages/FormBuilder";
import Inbox from "@/pages/Inbox";
import ProcessMonitoring from "@/pages/ProcessMonitoring";
import MobileApprovals from "@/pages/MobileApprovals";
import UserManagement from "@/pages/UserManagement";
import "@/App.css";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-400 text-sm" data-testid="auth-loading">
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
  if (user) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
      <Route path="/mobile" element={<RequireAuth><MobileApprovals /></RequireAuth>} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="chat" element={<Chat />} />
        <Route path="workflows" element={<WorkflowsList />} />
        <Route path="workflows/:id" element={<WorkflowBuilder />} />
        <Route path="forms" element={<FormsList />} />
        <Route path="forms/:id" element={<FormBuilder />} />
        <Route path="users" element={<RequireAuth><UserManagement /></RequireAuth>} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="monitoring" element={<ProcessMonitoring />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App" dir="rtl" lang="fa">
      <AuthProvider>
        <BadgeProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-center" dir="rtl" richColors />
          </BrowserRouter>
        </BadgeProvider>
      </AuthProvider>
    </div>
  );
}
