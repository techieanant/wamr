import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/query-client';
import { useAuth } from './hooks/use-auth';
import { useNotifications } from './hooks/use-notifications';
import { useEffect, useState } from 'react';
import { LoginPage } from './pages/login';
import DashboardPage from './pages/dashboard';
import WhatsAppConnection from './pages/whatsapp-connection';
import { ServiceConfigPage } from './pages/service-config';
import RequestsPage from './pages/requests';
import SettingsPage from './pages/settings';
import { MainLayout } from './components/layout/main-layout';
import { Toaster } from './components/ui/toaster';
import { socketClient } from './services/socket.client';

/**
 * Protected route wrapper
 * Redirects to login if user is not authenticated
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * Public route wrapper
 * Redirects to dashboard if user is already authenticated
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * Main App component
 */
function App() {
  const { checkAuth, isAuthenticated } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem('wamr-notifications') === 'true'
  );

  // Enable notifications hook
  useNotifications(notificationsEnabled && isAuthenticated);

  // Check authentication status on app load (only once)
  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect to WebSocket when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      socketClient.connect();
    } else {
      socketClient.disconnect();
    }

    return () => {
      socketClient.disconnect();
    };
  }, [isAuthenticated]);

  // Listen for notification permission changes
  useEffect(() => {
    const handleStorageChange = () => {
      setNotificationsEnabled(localStorage.getItem('wamr-notifications') === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <DashboardPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/whatsapp"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <WhatsAppConnection />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/services"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ServiceConfigPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/requests"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <RequestsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <SettingsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Default route */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* 404 catch-all */}
          <Route
            path="*"
            element={
              <div className="flex min-h-screen items-center justify-center">
                <div className="text-center">
                  <h1 className="mb-4 text-4xl font-bold">404</h1>
                  <p className="text-lg text-gray-600">Page not found</p>
                </div>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>

      {/* React Query Devtools (only in development) */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}

      {/* Toast notifications */}
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
