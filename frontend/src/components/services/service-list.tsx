import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { useUpdateService, useDeleteService } from '../../hooks/use-services';
import { useToast } from '../../hooks/use-toast';
import type { ServiceConfig } from '../../types/service.types';

interface ServiceListProps {
  services: ServiceConfig[];
  isLoading: boolean;
  onEdit: (service: ServiceConfig) => void;
}

export function ServiceList({ services, isLoading, onEdit }: ServiceListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<ServiceConfig | null>(null);

  const { toast } = useToast();
  const updateMutation = useUpdateService();
  const deleteMutation = useDeleteService();

  const handleToggleEnabled = async (service: ServiceConfig) => {
    try {
      await updateMutation.mutateAsync({
        id: service.id,
        data: { enabled: !service.enabled },
      });

      toast({
        title: 'Success',
        description: `${service.name} ${!service.enabled ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as { message?: string })?.message || 'Failed to update service',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (service: ServiceConfig) => {
    setServiceToDelete(service);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!serviceToDelete) return;

    try {
      await deleteMutation.mutateAsync(serviceToDelete.id);

      toast({
        title: 'Success',
        description: `${serviceToDelete.name} deleted successfully`,
      });

      setDeleteDialogOpen(false);
      setServiceToDelete(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as { message?: string })?.message || 'Failed to delete service',
        variant: 'destructive',
      });
    }
  };

  const getServiceTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      radarr: 'default',
      sonarr: 'secondary',
      overseerr: 'outline',
    };

    return (
      <Badge variant={variants[type] || 'default'}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12">
        <div className="text-center">
          <h3 className="mb-2 text-lg font-semibold">No Services Configured</h3>
          <p className="mb-4 text-muted-foreground">
            Add your first Radarr, Sonarr, or Overseerr service to get started
          </p>
        </div>
      </div>
    );
  }

  // Sort by priority order
  const sortedServices = [...services].sort((a, b) => a.priorityOrder - b.priorityOrder);

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Base URL</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedServices.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>{getServiceTypeBadge(service.serviceType)}</TableCell>
                <TableCell className="font-mono text-sm">{service.baseUrl}</TableCell>
                <TableCell>
                  <Badge variant="outline">{service.priorityOrder}</Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={service.enabled}
                    onCheckedChange={() => handleToggleEnabled(service)}
                    disabled={updateMutation.isPending}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(service)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(service)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{serviceToDelete?.name}</span>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
