import { useState, useEffect } from 'react';
import { Sidebar } from './sidebar';
import { Menu } from 'lucide-react';
import { useNotifications } from '../../hooks/use-notifications';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Get notification preference from localStorage
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('wamr-notifications') === 'true';
  });

  // Update when settings change
  useEffect(() => {
    const handleStorageChange = () => {
      setNotificationsEnabled(localStorage.getItem('wamr-notifications') === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    // Also check periodically for same-window updates
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Initialize notifications hook
  useNotifications(notificationsEnabled);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header with burger menu */}
        <header className="flex h-16 items-center border-b bg-card px-4 md:hidden">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="rounded-lg p-2 hover:bg-accent"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="ml-4 text-lg font-bold">WAMR</h1>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
