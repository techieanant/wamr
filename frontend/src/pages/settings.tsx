import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useToast } from '../hooks/use-toast';
import { useWhatsApp } from '../hooks/use-whatsapp';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Settings as SettingsIcon,
  User,
  Moon,
  Sun,
  Bell,
  Shield,
  Download,
  Upload,
  Key,
  CheckCircle,
} from 'lucide-react';
import { useTheme } from '../hooks/use-theme';
import { apiClient } from '../services/api.client';
import { useContacts } from '../hooks/use-contacts';
import type { AutoApprovalMode } from '../types/whatsapp.types';

interface SystemInfo {
  version: string;
  schemaVersion: string;
  environment: string;
  nodeVersion: string;
  platform: string;
  uptime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { status: whatsappStatus } = useWhatsApp();
  const { contacts } = useContacts();
  const queryClient = useQueryClient();
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    Notification.permission === 'granted'
  );
  const [autoApprovalMode, setAutoApprovalMode] = useState<AutoApprovalMode>('auto_approve');
  const [exceptionsEnabled, setExceptionsEnabled] = useState(false);
  const [exceptionContacts, setExceptionContacts] = useState<string[]>([]);
  const [isUpdatingApprovalMode, setIsUpdatingApprovalMode] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch settings from backend on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = (await apiClient.get('/api/settings')) as {
          data: Record<string, string | number | boolean | null>;
        };
        const settings = response.data;

        // Set theme from backend if available
        if (settings['wamr-ui-theme']) {
          const themeValue = settings['wamr-ui-theme'] as string;
          if (['dark', 'light', 'system'].includes(themeValue)) {
            setTheme(themeValue as 'dark' | 'light' | 'system');
          }
        } else {
          // Save current theme if not saved
          await apiClient.put('/api/settings/wamr-ui-theme', { value: theme });
        }

        // Set notifications from backend if available
        if (settings['wamr-notifications'] !== undefined) {
          const notificationsValue = Boolean(settings['wamr-notifications']);
          setNotificationsEnabled(notificationsValue);
          localStorage.setItem('wamr-notifications', notificationsValue ? 'true' : 'false');
        } else {
          // Save current notifications if not saved
          await apiClient.put('/api/settings/wamr-notifications', { value: notificationsEnabled });
          localStorage.setItem('wamr-notifications', notificationsEnabled ? 'true' : 'false');
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    };
    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch system info on component mount
  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const data = await apiClient.get<SystemInfo>('/api/system/info');
        setSystemInfo(data);
      } catch (error) {
        console.error('Failed to fetch system info:', error);
      }
    };
    fetchSystemInfo();
  }, []);

  // Load WhatsApp connection settings on component mount
  useEffect(() => {
    if (whatsappStatus) {
      setAutoApprovalMode(whatsappStatus.autoApprovalMode);
      setExceptionsEnabled(whatsappStatus.exceptionsEnabled);
      setExceptionContacts(whatsappStatus.exceptionContacts);
    }
  }, [whatsappStatus]);

  // Initialize notifications from localStorage and backend
  useEffect(() => {
    const savedNotifications = localStorage.getItem('wamr-notifications');
    if (savedNotifications === 'true') {
      setNotificationsEnabled(true);
    }
  }, []);

  // Sync theme changes to backend
  useEffect(() => {
    const syncThemeToBackend = async () => {
      try {
        await apiClient.put('/api/settings/wamr-ui-theme', { value: theme });
      } catch (error) {
        console.error('Failed to sync theme to backend:', error);
      }
    };
    syncThemeToBackend();
  }, [theme]);

  // Sync notifications changes to backend
  useEffect(() => {
    const syncNotificationsToBackend = async () => {
      try {
        await apiClient.put('/api/settings/wamr-notifications', { value: notificationsEnabled });
      } catch (error) {
        console.error('Failed to sync notifications to backend:', error);
      }
    };
    syncNotificationsToBackend();
  }, [notificationsEnabled]);

  const handleLogout = () => {
    logout();
    toast({
      title: 'Logged Out',
      description: 'You have been successfully logged out.',
    });
  };

  const handleNotificationToggle = async (enabled: boolean) => {
    if (enabled) {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        localStorage.setItem('wamr-notifications', 'true');
        toast({
          title: 'Notifications Enabled',
          description:
            'You will receive browser notifications for new requests and status changes.',
        });
      } else {
        setNotificationsEnabled(false);
        localStorage.setItem('wamr-notifications', 'false');
        toast({
          title: 'Permission Denied',
          description: 'Please enable notifications in your browser settings.',
          variant: 'destructive',
        });
      }
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem('wamr-notifications', 'false');
      toast({
        title: 'Notifications Disabled',
        description: 'You will no longer receive browser notifications.',
      });
    }
  };

  const handleApprovalModeChange = async (mode: AutoApprovalMode) => {
    setIsUpdatingApprovalMode(true);
    try {
      await apiClient.put('/api/whatsapp/auto-approval', { mode });

      // Update local state
      setAutoApprovalMode(mode);

      // Invalidate WhatsApp status query to refetch with new mode
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'] });

      const modeLabels = {
        auto_approve: 'Auto-approve all requests',
        auto_deny: 'Auto-deny all requests',
        manual: 'Manual approval required',
      };

      toast({
        title: 'Approval Mode Updated',
        description: `Switched to: ${modeLabels[mode]}`,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update approval mode.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingApprovalMode(false);
    }
  };

  const handleExceptionsChange = async (enabled: boolean, contacts?: string[]) => {
    setIsUpdatingApprovalMode(true);
    try {
      await apiClient.put('/api/whatsapp/exceptions', {
        exceptionsEnabled: enabled,
        exceptionContacts: contacts || exceptionContacts,
      });

      // Update local state
      setExceptionsEnabled(enabled);
      if (contacts) {
        setExceptionContacts(contacts);
      }

      // Invalidate WhatsApp status query to refetch
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'] });

      toast({
        title: 'Exceptions Updated',
        description: enabled
          ? `Exceptions enabled with ${contacts?.length || exceptionContacts.length} contact(s)`
          : 'Exceptions disabled',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update exceptions.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingApprovalMode(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'New passwords do not match.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: 'Error',
        description: 'Password must be at least 8 characters long.',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      await apiClient.post('/api/settings/change-password', {
        currentPassword,
        newPassword,
      });

      toast({
        title: 'Success',
        description: 'Password changed successfully.',
      });

      setChangePasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to change password.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await apiClient.get('/api/settings/export');

      // Create JSON file and download
      const dataStr = JSON.stringify(response.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wamr-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export Complete',
        description: 'Your data has been exported successfully.',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export data.';
      toast({
        title: 'Export Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const fileContent = await file.text();
      const importData = JSON.parse(fileContent);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await apiClient.post('/api/settings/import', importData);

      toast({
        title: 'Import Complete',
        description: response.message || 'Data imported successfully.',
      });

      // Show detailed notes
      if (response.notes) {
        setTimeout(() => {
          toast({
            title: 'Important Notes',
            description: Object.values(response.notes).join(' '),
          });
        }, 1000);
      }
    } catch (error: unknown) {
      let errorMessage = 'Failed to import data.';
      if (error instanceof SyntaxError) {
        errorMessage = 'Invalid JSON file format.';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      toast({
        title: 'Import Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
            <SettingsIcon className="h-6 w-6 md:h-8 md:w-8" />
            Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Manage your application preferences and account settings
          </p>
        </div>
      </div>

      {/* Account Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account
          </CardTitle>
          <CardDescription>Manage your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={user?.username || 'admin'} disabled className="max-w-md" />
            <p className="text-sm text-muted-foreground">Your username cannot be changed.</p>
          </div>

          <div className="flex flex-col gap-2 pt-4 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setChangePasswordOpen(true)}
              className="flex items-center gap-2"
            >
              <Key className="h-4 w-4" />
              Change Password
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            Appearance
          </CardTitle>
          <CardDescription>Customize the look and feel of the application</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="theme-mode">Theme Mode</Label>
              <p className="text-sm text-muted-foreground">Choose between light and dark mode</p>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4" />
              <Switch
                id="theme-mode"
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
              <Moon className="h-4 w-4" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>Configure browser notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notifications">Enable Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive browser notifications for new requests and status changes
              </p>
            </div>
            <Switch
              id="notifications"
              checked={notificationsEnabled}
              onCheckedChange={handleNotificationToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Request Approval Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Request Approval
          </CardTitle>
          <CardDescription>Configure how media requests are handled</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {whatsappStatus?.isConnected ? (
            <div className="space-y-4">
              <Label>Approval Mode</Label>
              <RadioGroup
                value={autoApprovalMode}
                onValueChange={(value: string) =>
                  handleApprovalModeChange(value as AutoApprovalMode)
                }
                disabled={isUpdatingApprovalMode}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="auto_approve" id="auto-approve" />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="auto-approve" className="cursor-pointer font-medium">
                      Auto-approve all requests
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      All incoming media requests will be automatically approved and submitted to
                      the media service immediately.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="manual" id="manual" />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="manual" className="cursor-pointer font-medium">
                      Manual approval required
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Requests will be marked as pending and require administrator approval before
                      being submitted to the media service.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="auto_deny" id="auto-deny" />
                  <div className="space-y-1 leading-none">
                    <Label htmlFor="auto-deny" className="cursor-pointer font-medium">
                      Auto-deny all requests
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      All incoming media requests will be automatically rejected. Users will be
                      notified that their request was declined.
                    </p>
                  </div>
                </div>
              </RadioGroup>

              {/* Exceptions Configuration */}
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="exceptions-enabled">Enable Exceptions</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow specific contacts to bypass the approval mode
                    </p>
                  </div>
                  <Switch
                    id="exceptions-enabled"
                    checked={exceptionsEnabled}
                    onCheckedChange={(enabled) => handleExceptionsChange(enabled)}
                    disabled={isUpdatingApprovalMode}
                  />
                </div>

                {exceptionsEnabled && (
                  <div className="space-y-2">
                    <Label>Exception Contacts</Label>
                    <p className="text-sm text-muted-foreground">
                      Select contacts that should receive different treatment
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {contacts
                        .filter((contact) => exceptionContacts.includes(contact.phoneNumberHash))
                        .map((contact) => (
                          <div
                            key={contact.id}
                            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-sm text-secondary-foreground"
                          >
                            {contact.contactName || contact.maskedPhone}
                            <button
                              onClick={() => {
                                const newContacts = exceptionContacts.filter(
                                  (hash) => hash !== contact.phoneNumberHash
                                );
                                handleExceptionsChange(true, newContacts);
                              }}
                              className="ml-1 hover:text-destructive"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                    </div>
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (value && !exceptionContacts.includes(value)) {
                          const newContacts = [...exceptionContacts, value];
                          handleExceptionsChange(true, newContacts);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Add contact..." />
                      </SelectTrigger>
                      <SelectContent>
                        {contacts
                          .filter((contact) => !exceptionContacts.includes(contact.phoneNumberHash))
                          .map((contact) => (
                            <SelectItem key={contact.id} value={contact.phoneNumberHash}>
                              {contact.contactName || contact.maskedPhone}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/50 p-6 text-center">
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                WhatsApp Connection Required
              </p>
              <p className="text-sm text-muted-foreground">
                You need an active WhatsApp connection to configure the request approval mode.
                Please connect your WhatsApp account first.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import & Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Import & Export
          </CardTitle>
          <CardDescription>Backup and restore your configuration and data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <Button
                variant="outline"
                onClick={handleExportData}
                disabled={isExporting}
                className="flex w-full items-center gap-2 sm:w-auto"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export All Data'}
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">
                Download all your WhatsApp settings, service configurations, and requests as a JSON
                file (v1.0.0)
              </p>
            </div>

            <div>
              <Button
                variant="outline"
                onClick={handleImportClick}
                disabled={isImporting}
                className="flex w-full items-center gap-2 sm:w-auto"
              >
                <Upload className="h-4 w-4" />
                {isImporting ? 'Importing...' : 'Import Data'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Restore data from a previously exported JSON file. Note: API keys must be
                reconfigured manually for security.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>Application version and runtime details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {systemInfo ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">{systemInfo.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Schema Version</span>
                <span className="font-mono">{systemInfo.schemaVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Environment</span>
                <span className="font-mono capitalize">{systemInfo.environment}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Node Version</span>
                <span className="font-mono">{systemInfo.nodeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform</span>
                <span className="font-mono">{systemInfo.platform}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-mono">
                  {Math.floor(systemInfo.uptime / 3600)}h{' '}
                  {Math.floor((systemInfo.uptime % 3600) / 60)}m
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Memory (Heap)</span>
                <span className="font-mono">
                  {systemInfo.memoryUsage.heapUsed}MB / {systemInfo.memoryUsage.heapTotal}MB
                </span>
              </div>
            </>
          ) : (
            <div className="py-4 text-center text-muted-foreground">
              Loading system information...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Password must be at least 8 characters long.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setChangePasswordOpen(false)}
              disabled={isChangingPassword}
            >
              Cancel
            </Button>
            <Button onClick={handleChangePassword} disabled={isChangingPassword}>
              {isChangingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
