import { useState } from 'react';
import { Plus, Blocks, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { ServiceList } from '../components/services';
import { ServiceForm } from '../components/services';
import { useServices } from '../hooks/use-services';
import type { ServiceConfig } from '../types/service.types';

export function ServiceConfigPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceConfig | undefined>(undefined);

  const { data: servicesData, isLoading, error } = useServices();

  const handleAddService = () => {
    setSelectedService(undefined);
    setIsFormOpen(true);
  };

  const handleEditService = (service: ServiceConfig) => {
    setSelectedService(service);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setSelectedService(undefined);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setSelectedService(undefined);
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-semibold text-red-600">Error Loading Services</h2>
          <p className="text-gray-600">
            {(error as { message?: string })?.message || 'Failed to load services'}
          </p>
        </div>
      </div>
    );
  }

  const servicesWithoutApiKey =
    servicesData?.services.filter((service) => service.enabled && !service.hasApiKey) || [];

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      {/* API Key Warning Banner */}
      {servicesWithoutApiKey.length > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <strong>API Keys Required:</strong> {servicesWithoutApiKey.length} enabled service(s)
            need API keys configured before they can process requests. Please edit each service to
            add the missing API keys.
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
              <Blocks className="h-6 w-6 md:h-8 md:w-8" />
              Service Configuration
            </h1>
            <p className="mt-2 text-muted-foreground">
              Configure Radarr, Sonarr, and Overseerr services for media requests
            </p>
          </div>
          {/* Desktop button */}
          <Button onClick={handleAddService} className="hidden md:flex">
            <Plus className="mr-2 h-4 w-4" />
            Add Service
          </Button>
        </div>
        {/* Mobile button */}
        <Button onClick={handleAddService} className="w-full md:hidden">
          <Plus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      </div>

      {/* Service List */}
      <ServiceList
        services={servicesData?.services || []}
        isLoading={isLoading}
        onEdit={handleEditService}
      />

      {/* Service Form Dialog */}
      <ServiceForm
        service={selectedService}
        open={isFormOpen}
        onClose={handleFormClose}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
