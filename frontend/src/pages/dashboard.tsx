import {
  LayoutDashboard,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Smartphone,
  Blocks,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useWhatsApp } from '../hooks/use-whatsapp';
import { useServices } from '../hooks/use-services';
import { useRequests } from '../hooks/use-requests';

export default function DashboardPage() {
  const { status: whatsappStatus, isLoading: whatsappLoading } = useWhatsApp();
  const { data: servicesData, isLoading: servicesLoading } = useServices();
  const { requests, isLoading: requestsLoading } = useRequests(1, 1000); // Get all requests

  // Calculate request stats
  const stats = {
    total: requests.length,
    approved: requests.filter((r) => r.status === 'APPROVED').length,
    failed: requests.filter((r) => r.status === 'FAILED').length,
    pending: requests.filter((r) => r.status === 'PENDING').length,
  };

  const isConnected = whatsappStatus?.isConnected || false;
  const services = servicesData?.services || [];
  const activeServices = services.filter((s) => s.enabled);

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
          <LayoutDashboard className="h-6 w-6 md:h-8 md:w-8" />
          Dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">Overview of your WhatsApp media request system</p>
      </div>

      {/* System Status */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* WhatsApp Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-5 w-5" />
              WhatsApp Connection
            </CardTitle>
          </CardHeader>
          <CardContent>
            {whatsappLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {whatsappStatus?.status === 'LOADING' ||
                  whatsappStatus?.status === 'CONNECTING' ? (
                    <Badge className="bg-blue-500 hover:bg-blue-600">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      {whatsappStatus.status === 'LOADING' ? 'Loading' : 'Connecting'}
                    </Badge>
                  ) : (
                    <Badge variant={isConnected ? 'default' : 'destructive'}>
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  )}
                </div>
                {isConnected && whatsappStatus?.phoneNumber && (
                  <p className="text-sm text-muted-foreground">
                    Phone: {whatsappStatus.phoneNumber}
                  </p>
                )}
                {(whatsappStatus?.status === 'LOADING' ||
                  whatsappStatus?.status === 'CONNECTING') && (
                  <p className="text-xs text-muted-foreground">Initializing WhatsApp client...</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Services Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Blocks className="h-5 w-5" />
              Configured Services
            </CardTitle>
          </CardHeader>
          <CardContent>
            {servicesLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{activeServices.length}</span>
                  <span className="text-sm text-muted-foreground">/ {services.length} active</span>
                </div>
                {services.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {services.map((service) => (
                      <Badge key={service.id} variant={service.enabled ? 'default' : 'secondary'}>
                        {service.serviceType}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Request Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground">All time</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats.approved}</div>
                <p className="text-xs text-muted-foreground">Successfully completed</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats.failed}</div>
                <p className="text-xs text-muted-foreground">Errors encountered</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stats.pending}</div>
                <p className="text-xs text-muted-foreground">Awaiting processing</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
          <CardDescription>Get started with your media request system</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium">1. Connect WhatsApp</h3>
            <p className="text-sm text-muted-foreground">
              Navigate to the WhatsApp page to scan the QR code and connect your account.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">2. Configure Services</h3>
            <p className="text-sm text-muted-foreground">
              Add your Radarr, Sonarr, or Overseerr services to handle media requests.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">3. Monitor Requests</h3>
            <p className="text-sm text-muted-foreground">
              View and manage all incoming media requests from the Requests page.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
