import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/query-client';
import { useAuth } from './hooks/use-auth';
import { useSetup } from './hooks/use-setup';
import { useNotifications } from './hooks/use-notifications';
import { useEffect, useState } from 'react';
import { LoginPage } from './pages/login';
import { SetupPage } from './pages/setup';
import { BackupCodeResetPage } from './pages/backup-code-reset';
import DashboardPage from './pages/dashboard';
import WhatsAppConnection from './pages/whatsapp-connection';
import { ServiceConfigPage } from './pages/service-config';
import RequestsPage from './pages/requests';
import ContactsPage from './pages/contacts';
import SettingsPage from './pages/settings';
import { MainLayout } from './components/layout/main-layout';
import { Toaster } from '@/components/ui/toaster';
import { socketClient } from './services/socket.client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('app');

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
 * Main App component
 */
function App() {
  const { checkAuth, isAuthenticated } = useAuth();
  const { isSetupComplete = false, isLoading: isSetupLoading } = useSetup() ?? {};
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
      // Small delay to ensure cookie is set and auth is fully established
      const timer = setTimeout(() => {
        logger.debug('Initiating WebSocket connection (user authenticated)');
        socketClient.connect();
      }, 100);

      return () => {
        clearTimeout(timer);
        logger.debug('Disconnecting WebSocket (user logged out)');
        socketClient.disconnect();
      };
    } else {
      // Immediately disconnect if not authenticated
      socketClient.disconnect();
    }
  }, [isAuthenticated]);

  // Listen for notification permission changes
  useEffect(() => {
    const handleStorageChange = () => {
      setNotificationsEnabled(localStorage.getItem('wamr-notifications') === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Show loading while checking setup
  if (isSetupLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Setup route - always render, handles redirect internally */}
          <Route path="/setup" element={<SetupPage />} />

          {/* Login route - always accessible, handles auth check internally */}
          <Route path="/login" element={<LoginPage />} />

          {/* Backup code reset route (public) */}
          <Route path="/reset-password" element={<BackupCodeResetPage />} />

          {/* Redirect to setup if not complete - must be after specific routes */}
          {!isSetupComplete && <Route path="*" element={<Navigate to="/setup" replace />} />}

          {/* Protected routes (only if setup complete) */}
          {isSetupComplete && (
            <>
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
                path="/contacts"
                element={
                  <ProtectedRoute>
                    <MainLayout>
                      <ContactsPage />
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
            </>
          )}

          {/* Default route */}
          {isSetupComplete && <Route path="/" element={<Navigate to="/dashboard" replace />} />}

          {/* 404 catch-all (only when setup complete) */}
          {isSetupComplete && (
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
          )}
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
