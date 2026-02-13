import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createLogger } from '@/lib/logger';
import { Eye, EyeOff, Copy, Check, AlertCircle } from 'lucide-react';
import { useSetup } from '@/hooks/use-setup';

const logger = createLogger('SetupPage');

export function SetupPage() {
  const navigate = useNavigate();
  const { isSetupComplete } = useSetup();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [savedBackupCodes, setSavedBackupCodes] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const { completeSetup, isSetupLoading, setupError } = useSetup();

  useEffect(() => {
    if (isSetupComplete && !backupCodes) {
      navigate('/login');
    }
  }, [isSetupComplete, backupCodes, navigate]);

  const displayError = error || (setupError instanceof Error ? setupError.message : null);

  const passwordRequirements = [{ label: 'At least 4 characters', met: password.length >= 4 }];

  const isPasswordValid = passwordRequirements.every((req) => req.met);
  const doPasswordsMatch = password === confirmPassword && password !== '';

  const isLoading = isSetupLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordValid) {
      setError('Password does not meet all requirements');
      return;
    }

    if (!doPasswordsMatch) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    logger.info('Starting setup with username:', username);

    try {
      logger.info('Calling completeSetup...');
      const response = await completeSetup({ username, password });
      logger.info('Setup response:', response);

      if (response.success) {
        logger.info('Setup successful, navigating to login...');
        setBackupCodes(response.data.backupCodes);
        logger.info('Backup codes set');
      } else {
        setError(response.data.message || 'Setup failed');
      }
    } catch (err: unknown) {
      logger.error({ error: err }, 'Setup failed with error');
      const errorMessage = err instanceof Error ? err.message : 'Failed to complete setup';
      setError(errorMessage);
    }
  };

  useEffect(() => {
    if (backupCodes) {
      navigate('/login');
    }
  }, [backupCodes, navigate]);

  const copyToClipboard = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (backupCodes) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Setup Complete!</CardTitle>
            <CardDescription>
              Your admin account has been created. Save these backup codes in a secure password
              manager, then click Continue to Login.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> These codes can be used to reset your password if you
                get locked out. Each code can only be used once. You will not see them again!
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              {backupCodes.map((code, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-md border bg-muted p-3 font-mono text-sm"
                >
                  <span>
                    {index + 1}. {code}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(code, index)}>
                    {copiedIndex === index ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <input
                id="saved"
                type="checkbox"
                checked={savedBackupCodes}
                onChange={(e) => setSavedBackupCodes(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="saved" className="text-sm font-medium">
                I have saved these backup codes in a secure location
              </Label>
            </div>

            <Button
              onClick={() => navigate('/login')}
              disabled={!savedBackupCodes}
              className="w-full"
            >
              Continue to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to WAMR</CardTitle>
          <CardDescription>Complete the initial setup to create your admin account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {displayError && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                minLength={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
              />
            </div>

            <div className="space-y-1 text-sm">
              <p className="font-medium">Password requirements:</p>
              {passwordRequirements.map((req, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2 ${
                    req.met ? 'text-green-600' : 'text-muted-foreground'
                  }`}
                >
                  {req.met ? '✓' : '○'} {req.label}
                </div>
              ))}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !isPasswordValid || !doPasswordsMatch || !username}
              className="w-full"
            >
              {isLoading ? 'Creating Account...' : 'Complete Setup'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
