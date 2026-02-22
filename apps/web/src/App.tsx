import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { isNativePlatform } from '@/lib/platform';

// Desktop
import AppLayout from '@/components/layout/AppLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import TimeEntriesPage from '@/pages/TimeEntriesPage';
import CustomersPage from '@/pages/CustomersPage';
import ProjectsPage from '@/pages/ProjectsPage';
import UsersPage from '@/pages/UsersPage';
import DevicesPage from '@/pages/DevicesPage';

// Mobile
import MobileLoginPage from '@/pages/mobile/MobileLoginPage';
import MobileScanPage from '@/pages/mobile/MobileScanPage';
import MobileHomePage from '@/pages/mobile/MobileHomePage';
import MobileHistoryPage from '@/pages/mobile/MobileHistoryPage';

import { Loader2 } from 'lucide-react';

// ── Auth Guards ─────────────────────────────────────

function RequireAuth({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/time-entries" replace />;
  return <>{children}</>;
}

function RequireMobileAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/m/login" replace />;
  return <>{children}</>;
}

function WorkerRedirect() {
  const { user } = useAuth();
  if (user?.role === 'WORKER') return <Navigate to="/time-entries" replace />;
  return <DashboardPage />;
}

// ── Plattform-Weiche ────────────────────────────────

function PlatformRedirect() {
  const { isAuthenticated } = useAuth();
  if (isNativePlatform()) {
    return <Navigate to={isAuthenticated ? '/m' : '/m/login'} replace />;
  }
  return <Navigate to={isAuthenticated ? '/' : '/login'} replace />;
}

// ── App ─────────────────────────────────────────────

export default function App() {
  const { isLoading, tryRefresh } = useAuth();

  useEffect(() => {
    tryRefresh();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600 mx-auto" />
          <p className="mt-3 text-sm text-surface-400">Laden...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* ── Mobile (/m/*) ──────────────────────── */}
      <Route
        path="/m/login"
        element={isAuthenticated ? <Navigate to="/m" replace /> : <MobileLoginPage />}
      />
      <Route path="/m/scan" element={<MobileScanPage />} />
      <Route
        path="/m"
        element={
          <RequireMobileAuth>
            <MobileHomePage />
          </RequireMobileAuth>
        }
      />
      <Route
        path="/m/history"
        element={
          <RequireMobileAuth>
            <MobileHistoryPage />
          </RequireMobileAuth>
        }
      />

      {/* ── Pair Deeplink ──────────────────────── */}
      <Route
        path="/pair"
        element={
          isNativePlatform()
            ? <Navigate to="/m/scan" replace />
            : <Navigate to="/devices" replace />
        }
      />

      {/* ── Desktop ────────────────────────────── */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<WorkerRedirect />} />
        <Route path="/time-entries" element={<TimeEntriesPage />} />
        <Route
          path="/customers"
          element={<RequireAuth roles={['ADMIN', 'DISPO']}><CustomersPage /></RequireAuth>}
        />
        <Route
          path="/projects"
          element={<RequireAuth roles={['ADMIN', 'DISPO']}><ProjectsPage /></RequireAuth>}
        />
        <Route
          path="/users"
          element={<RequireAuth roles={['ADMIN']}><UsersPage /></RequireAuth>}
        />
        <Route path="/devices" element={<DevicesPage />} />
      </Route>

      {/* ── Fallback ───────────────────────────── */}
      <Route path="*" element={<PlatformRedirect />} />
    </Routes>
  );
}
