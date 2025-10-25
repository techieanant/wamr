import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  useCreateService,
  useUpdateService,
  useTestConnection,
  useGetMetadata,
} from '../../hooks/use-services';
import { useToast } from '../../hooks/use-toast';
import type {
  ServiceConfig,
  CreateServiceRequest,
  UpdateServiceRequest,
  TestConnectionRequest,
  GetMetadataRequest,
  ServiceType,
  QualityProfile,
  RootFolder,
} from '../../types/service.types';

interface ServiceFormProps {
  service?: ServiceConfig;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  serviceType: ServiceType;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  priorityOrder: number;
  maxResults: number;
  // Radarr/Sonarr specific (not applicable for Overseerr)
  qualityProfileId?: number;
  rootFolderPath?: string;
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
  version?: string;
}

export function ServiceForm({ service, open, onClose, onSuccess }: ServiceFormProps) {
  const isEdit = !!service;
  const { toast } = useToast();

  const createMutation = useCreateService();
  const updateMutation = useUpdateService();
  const testConnectionMutation = useTestConnection();
  const getMetadataMutation = useGetMetadata();

  const [formData, setFormData] = useState<FormData>({
    name: '',
    serviceType: 'radarr',
    baseUrl: '',
    apiKey: '',
    enabled: true,
    priorityOrder: 1,
    maxResults: 5,
  });

  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);
  const [qualityProfiles, setQualityProfiles] = useState<QualityProfile[]>([]);
  const [rootFolders, setRootFolders] = useState<RootFolder[]>([]);

  // Check if any fields have changed when editing
  const hasChanges = (): boolean => {
    if (!isEdit || !service) return true; // Always allow submit for new services

    // Check if any fields have changed
    if (formData.name !== service.name) return true;
    if (formData.baseUrl !== service.baseUrl) return true;
    if (formData.enabled !== service.enabled) return true;
    if (formData.priorityOrder !== service.priorityOrder) return true;
    if (formData.maxResults !== service.maxResults) return true;
    if (formData.apiKey) return true; // New API key provided

    // Check service-specific fields
    if (formData.serviceType === 'radarr' || formData.serviceType === 'sonarr') {
      const currentQualityProfile = service.qualityProfileId ?? undefined;
      const currentRootFolder = service.rootFolderPath ?? undefined;

      if (formData.qualityProfileId !== currentQualityProfile) return true;
      if (formData.rootFolderPath !== currentRootFolder) return true;
    }

    return false;
  };

  // Load service data when editing
  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name,
        serviceType: service.serviceType,
        baseUrl: service.baseUrl,
        apiKey: '', // Don't populate API key for security
        enabled: service.enabled,
        priorityOrder: service.priorityOrder,
        maxResults: service.maxResults ?? 5,
        qualityProfileId: service.qualityProfileId ?? undefined,
        rootFolderPath: service.rootFolderPath ?? undefined,
      });
    } else {
      // Reset form
      setFormData({
        name: '',
        serviceType: 'radarr',
        baseUrl: '',
        apiKey: '',
        enabled: true,
        priorityOrder: 1,
        maxResults: 5,
      });
      setConnectionTest(null);
      setQualityProfiles([]);
      setRootFolders([]);
    }
  }, [service, open]);

  const handleTestConnection = async () => {
    // When editing, we can use serviceId to test with stored credentials
    // When creating, we need baseUrl and apiKey
    if (!isEdit && (!formData.baseUrl || !formData.apiKey)) {
      toast({
        title: 'Validation Error',
        description: 'Base URL and API Key are required to test connection',
        variant: 'destructive',
      });
      return;
    }

    setConnectionTest(null);

    try {
      const requestData: TestConnectionRequest = {};

      if (isEdit && service) {
        // Use stored credentials with serviceId
        requestData.serviceId = service.id;
        // Override with new values if provided
        if (formData.baseUrl !== service.baseUrl) {
          requestData.baseUrl = formData.baseUrl;
        }
        if (formData.apiKey) {
          requestData.apiKey = formData.apiKey;
        }
      } else {
        // New service - provide all details
        requestData.serviceType = formData.serviceType;
        requestData.baseUrl = formData.baseUrl;
        requestData.apiKey = formData.apiKey;
      }

      const result = await testConnectionMutation.mutateAsync(requestData);

      setConnectionTest({
        success: true,
        message: result.message,
        version: result.version,
      });

      toast({
        title: 'Connection Successful',
        description: result.message,
      });

      // Fetch metadata after successful connection
      await fetchMetadata();
    } catch (error) {
      const errorMessage = (error as { message?: string })?.message || 'Connection test failed';

      setConnectionTest({
        success: false,
        message: errorMessage,
      });

      toast({
        title: 'Connection Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const fetchMetadata = async () => {
    // When editing, we can use serviceId to fetch with stored credentials
    // When creating, we need baseUrl and apiKey
    if (!isEdit && (!formData.baseUrl || !formData.apiKey)) return;

    try {
      const requestData: GetMetadataRequest = {};

      if (isEdit && service) {
        // Use stored credentials with serviceId
        requestData.serviceId = service.id;
        // Override with new values if provided
        if (formData.baseUrl !== service.baseUrl) {
          requestData.baseUrl = formData.baseUrl;
        }
        if (formData.apiKey) {
          requestData.apiKey = formData.apiKey;
        }
      } else {
        // New service - provide all details
        requestData.serviceType = formData.serviceType;
        requestData.baseUrl = formData.baseUrl;
        requestData.apiKey = formData.apiKey;
      }

      const metadata = await getMetadataMutation.mutateAsync(requestData);

      if (formData.serviceType === 'radarr' || formData.serviceType === 'sonarr') {
        setQualityProfiles(metadata.qualityProfiles || []);
        setRootFolders(metadata.rootFolders || []);
      }
      // Overseerr doesn't require metadata - it manages its own Radarr/Sonarr configurations
    } catch (error) {
      toast({
        title: 'Failed to Load Metadata',
        description:
          (error as { message?: string })?.message || 'Failed to load metadata from service',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isEdit && service) {
        // Build update request data - only include fields that have changed
        const updateData: UpdateServiceRequest = {};

        // Only include changed fields
        if (formData.name !== service.name) {
          updateData.name = formData.name;
        }
        if (formData.baseUrl !== service.baseUrl) {
          updateData.baseUrl = formData.baseUrl;
        }
        if (formData.enabled !== service.enabled) {
          updateData.enabled = formData.enabled;
        }
        if (formData.priorityOrder !== service.priorityOrder) {
          updateData.priorityOrder = formData.priorityOrder;
        }
        if (formData.maxResults !== service.maxResults) {
          updateData.maxResults = formData.maxResults;
        }

        // Only add API key if provided (user wants to change it)
        if (formData.apiKey) {
          updateData.apiKey = formData.apiKey;
        }

        // Add service-specific fields if changed (only for Radarr/Sonarr, not Overseerr)
        if (formData.serviceType === 'radarr' || formData.serviceType === 'sonarr') {
          // Compare with null-safe equality check
          const currentQualityProfile = service.qualityProfileId ?? undefined;
          const currentRootFolder = service.rootFolderPath ?? undefined;

          if (formData.qualityProfileId !== currentQualityProfile) {
            updateData.qualityProfileId = formData.qualityProfileId;
          }
          if (formData.rootFolderPath !== currentRootFolder) {
            updateData.rootFolderPath = formData.rootFolderPath;
          }
        }

        // Only send update if there are changes
        if (Object.keys(updateData).length === 0) {
          toast({
            title: 'No Changes',
            description: 'No fields were modified',
            variant: 'default',
          });
          return;
        }

        await updateMutation.mutateAsync({
          id: service.id,
          data: updateData,
        });

        toast({
          title: 'Success',
          description: `${formData.name} updated successfully`,
        });
      } else {
        // Build create request data - includes serviceType and requires apiKey
        const createData: CreateServiceRequest = {
          name: formData.name,
          serviceType: formData.serviceType,
          baseUrl: formData.baseUrl,
          apiKey: formData.apiKey,
          enabled: formData.enabled,
          priorityOrder: formData.priorityOrder,
          maxResults: formData.maxResults,
        };

        // Add service-specific fields (only for Radarr/Sonarr, not Overseerr)
        if (formData.serviceType === 'radarr' || formData.serviceType === 'sonarr') {
          createData.qualityProfileId = formData.qualityProfileId;
          createData.rootFolderPath = formData.rootFolderPath;
        }

        await createMutation.mutateAsync(createData);

        toast({
          title: 'Success',
          description: `${formData.name} created successfully`,
        });
      }

      onSuccess();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          (error as { message?: string })?.message ||
          `Failed to ${isEdit ? 'update' : 'create'} service`,
        variant: 'destructive',
      });
    }
  };

  const handleFieldChange = (field: keyof FormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Reset connection test when URL or API key changes
    if (field === 'baseUrl' || field === 'apiKey') {
      setConnectionTest(null);
    }

    // Reset service-specific fields when type changes
    if (field === 'serviceType') {
      setFormData((prev) => ({
        ...prev,
        qualityProfileId: undefined,
        rootFolderPath: undefined,
      }));
      setConnectionTest(null);
      setQualityProfiles([]);
      setRootFolders([]);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Service' : 'Add Service'}</DialogTitle>
          <DialogDescription>
            Configure a Radarr, Sonarr, or Overseerr service for media requests
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="My Radarr Server"
              required
            />
          </div>

          {/* Service Type */}
          <div className="space-y-2">
            <Label htmlFor="serviceType">Service Type</Label>
            <select
              id="serviceType"
              value={formData.serviceType}
              onChange={(e) => handleFieldChange('serviceType', e.target.value as ServiceType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isEdit}
              required
            >
              <option value="radarr">Radarr</option>
              <option value="sonarr">Sonarr</option>
              <option value="overseerr">Overseerr</option>
            </select>
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              value={formData.baseUrl}
              onChange={(e) => handleFieldChange('baseUrl', e.target.value)}
              placeholder="https://radarr.example.com"
              required
            />
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">
              API Key{' '}
              {isEdit && (
                <span className="text-muted-foreground">(leave blank to keep existing)</span>
              )}
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={formData.apiKey}
              onChange={(e) => handleFieldChange('apiKey', e.target.value)}
              placeholder={isEdit ? '••••••••••••••••' : 'Your API key'}
              required={!isEdit}
            />
          </div>

          {/* Connection Test */}
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={
                testConnectionMutation.isPending ||
                !formData.baseUrl ||
                (!isEdit && !formData.apiKey)
              }
            >
              {testConnectionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            {connectionTest && (
              <div className="flex items-center gap-2">
                {connectionTest.success ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm text-green-600">
                      {connectionTest.message}
                      {connectionTest.version && ` (${connectionTest.version})`}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-sm text-red-600">{connectionTest.message}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Radarr/Sonarr specific fields */}
          {(formData.serviceType === 'radarr' || formData.serviceType === 'sonarr') && (
            <>
              {/* Quality Profile */}
              <div className="space-y-2">
                <Label htmlFor="qualityProfileId">Quality Profile</Label>
                <select
                  id="qualityProfileId"
                  value={formData.qualityProfileId || ''}
                  onChange={(e) => handleFieldChange('qualityProfileId', parseInt(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={qualityProfiles.length === 0 && !formData.qualityProfileId}
                  required
                >
                  <option value="">Select quality profile</option>
                  {/* Show current value if editing and no profiles loaded */}
                  {isEdit && formData.qualityProfileId && qualityProfiles.length === 0 && (
                    <option key={formData.qualityProfileId} value={formData.qualityProfileId}>
                      Current: Profile ID {formData.qualityProfileId}
                    </option>
                  )}
                  {qualityProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                {qualityProfiles.length === 0 && !isEdit && (
                  <p className="text-sm text-muted-foreground">
                    Test connection to load quality profiles
                  </p>
                )}
                {qualityProfiles.length === 0 && isEdit && (
                  <p className="text-sm text-muted-foreground">
                    Current value shown. Test connection to load new options.
                  </p>
                )}
              </div>

              {/* Root Folder */}
              <div className="space-y-2">
                <Label htmlFor="rootFolderPath">Root Folder</Label>
                <select
                  id="rootFolderPath"
                  value={formData.rootFolderPath || ''}
                  onChange={(e) => handleFieldChange('rootFolderPath', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={rootFolders.length === 0 && !formData.rootFolderPath}
                  required
                >
                  <option value="">Select root folder</option>
                  {/* Show current value if editing and no folders loaded */}
                  {isEdit && formData.rootFolderPath && rootFolders.length === 0 && (
                    <option key={formData.rootFolderPath} value={formData.rootFolderPath}>
                      Current: {formData.rootFolderPath}
                    </option>
                  )}
                  {rootFolders.map((folder) => (
                    <option key={folder.id} value={folder.path}>
                      {folder.path}
                    </option>
                  ))}
                </select>
                {rootFolders.length === 0 && !isEdit && (
                  <p className="text-sm text-muted-foreground">
                    Test connection to load root folders
                  </p>
                )}
                {rootFolders.length === 0 && isEdit && (
                  <p className="text-sm text-muted-foreground">
                    Current value shown. Test connection to load new options.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priorityOrder">Priority (1-5)</Label>
            <Input
              id="priorityOrder"
              type="number"
              min={1}
              max={5}
              value={formData.priorityOrder}
              onChange={(e) => handleFieldChange('priorityOrder', parseInt(e.target.value))}
              required
            />
            <p className="text-sm text-muted-foreground">
              Lower numbers have higher priority. Services are tried in priority order.
            </p>
          </div>

          {/* Max Results */}
          <div className="space-y-2">
            <Label htmlFor="maxResults">Max Results</Label>
            <Input
              id="maxResults"
              type="number"
              min={1}
              max={20}
              value={formData.maxResults}
              onChange={(e) => handleFieldChange('maxResults', parseInt(e.target.value))}
              required
            />
            <p className="text-sm text-muted-foreground">
              Maximum number of search results to return (1-20). The final result count will use the
              highest value across all enabled services.
            </p>
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <Label htmlFor="enabled">Enabled</Label>
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) => handleFieldChange('enabled', checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || (isEdit && !hasChanges())}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isEdit ? (
                'Update'
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
