import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { roleLabel } from '@/lib/format';
import {
  LayoutDashboard,
  Clock,
  Building2,
  FolderKanban,
  Users,
  LogOut,
  Menu,
  X,
  Smartphone,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'DISPO'] },
  { path: '/time-entries', label: 'Zeiterfassung', icon: Clock, roles: ['ADMIN', 'DISPO', 'WORKER'] },
  { path: '/customers', label: 'Kunden', icon: Building2, roles: ['ADMIN', 'DISPO'] },
  { path: '/projects', label: 'Projekte', icon: FolderKanban, roles: ['ADMIN', 'DISPO'] },
  { path: '/users', label: 'Mitarbeiter', icon: Users, roles: ['ADMIN'] },
  { path: '/devices', label: 'Geräte', icon: Smartphone, roles: ['ADMIN', 'DISPO', 'WORKER'] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleItems = navItems.filter(
    (item) => user && item.roles.includes(user.role),
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-surface-900 transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-5 border-b border-surface-700/50">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <Clock className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">Zeiterfassung</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleItems.map((item) => {
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-600/20 text-brand-300'
                    : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200',
                )}
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                {item.label}
                {isActive && <ChevronRight className="ml-auto h-4 w-4 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* User-Info */}
        <div className="border-t border-surface-700/50 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white uppercase">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-200 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-surface-500">{roleLabel(user?.role || '')}</p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-2 text-surface-500 hover:bg-surface-800 hover:text-surface-300 transition-colors"
              title="Abmelden"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile Header */}
        <header className="flex h-14 items-center gap-4 border-b bg-white px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-surface-600 hover:bg-surface-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-surface-800">Zeiterfassung</span>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
