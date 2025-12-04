import { useState, useEffect } from 'react';
import { useRequests } from '../hooks/use-requests';
import { useToast } from '../hooks/use-toast';
import type { RequestStatus } from '../types/request.types';
import { RequestsTable } from '../components/requests/requests-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Loader2, Filter, FileText, CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import type { DateRange } from 'react-day-picker';

export default function RequestsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'ALL'>('ALL');
  const [requesterSearch, setRequesterSearch] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'movie' | 'series'>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<number | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [requestToApprove, setRequestToApprove] = useState<number | null>(null);
  const [requestToReject, setRequestToReject] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const {
    requests,
    pagination,
    isLoading,
    deleteRequest,
    isDeleting,
    approveRequest,
    isApproving,
    rejectRequest,
    isRejecting,
    socket,
  } = useRequests(page, 50, statusFilter === 'ALL' ? undefined : statusFilter);

  // Default to previous month shown under Date Range picker
  const prevMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  })();

  // Listen for new request events and show toast
  useEffect(() => {
    if (!socket.isConnected) return;

    const cleanup = socket.on('request:new', (data: unknown) => {
      const requestData = data as { title?: string; user?: string };
      toast({
        title: 'New Request Received',
        description: `${requestData.title || 'A new media request'} from user ${requestData.user || 'Unknown'}`,
      });
    });

    return cleanup;
  }, [socket, toast]);

  const handleDelete = (requestId: number) => {
    setRequestToDelete(requestId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (requestToDelete) {
      deleteRequest(requestToDelete, {
        onSuccess: () => {
          toast({
            title: 'Request Deleted',
            description: 'The request has been removed successfully.',
          });
          setDeleteDialogOpen(false);
          setRequestToDelete(null);
        },
        onError: (error) => {
          toast({
            title: 'Delete Failed',
            description: error instanceof Error ? error.message : 'Failed to delete request',
            variant: 'destructive',
          });
        },
      });
    }
  };

  const handleApprove = (requestId: number) => {
    setRequestToApprove(requestId);
    setApproveDialogOpen(true);
  };

  const confirmApprove = () => {
    if (requestToApprove) {
      approveRequest(requestToApprove, {
        onSuccess: () => {
          toast({
            title: 'Request Approved',
            description: 'The request has been approved and submitted to the media service.',
          });
          setApproveDialogOpen(false);
          setRequestToApprove(null);
        },
        onError: (error) => {
          toast({
            title: 'Approval Failed',
            description: error instanceof Error ? error.message : 'Failed to approve request',
            variant: 'destructive',
          });
        },
      });
    }
  };

  const handleReject = (requestId: number) => {
    setRequestToReject(requestId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (requestToReject) {
      rejectRequest(
        { id: requestToReject, reason: rejectReason || undefined },
        {
          onSuccess: () => {
            toast({
              title: 'Request Rejected',
              description: 'The request has been rejected and the user has been notified.',
            });
            setRejectDialogOpen(false);
            setRequestToReject(null);
            setRejectReason('');
          },
          onError: (error) => {
            toast({
              title: 'Rejection Failed',
              description: error instanceof Error ? error.message : 'Failed to reject request',
              variant: 'destructive',
            });
          },
        }
      );
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading requests...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
            <FileText className="h-6 w-6 md:h-8 md:w-8" />
            Media Requests
          </h1>
          <p className="mt-2 text-muted-foreground">Manage all media requests from users</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Status Filter */}
            <div>
              <label className="mb-2 block text-sm font-medium">Status</label>
              <Select
                value={statusFilter}
                onValueChange={(value: string) => {
                  setStatusFilter(value as RequestStatus | 'ALL');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="SUBMITTED">Submitted</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div>
              <label className="mb-2 block text-sm font-medium">Search</label>
              <div className="relative">
                <Input
                  placeholder="Search by name, number, or title..."
                  value={requesterSearch}
                  onChange={(e) => setRequesterSearch(e.target.value)}
                  className="pr-8"
                />
                {requesterSearch && (
                  <button
                    onClick={() => setRequesterSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Media Type Filter */}
            <div>
              <label className="mb-2 block text-sm font-medium">Type</label>
              <Select
                value={mediaTypeFilter}
                onValueChange={(value) => setMediaTypeFilter(value as 'all' | 'movie' | 'series')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="movie">Movies</SelectItem>
                  <SelectItem value="series">Series</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="mb-2 block text-sm font-medium">Date Range</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dateRange && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d, yyyy')}
                        </>
                      ) : (
                        format(dateRange.from, 'MMM d, yyyy')
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from ?? prevMonth}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    disabled={{ after: new Date() }}
                    excludeDisabled
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Clear Filters */}
          {(statusFilter !== 'ALL' ||
            requesterSearch ||
            mediaTypeFilter !== 'all' ||
            dateRange?.from ||
            dateRange?.to) && (
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('ALL');
                  setRequesterSearch('');
                  setMediaTypeFilter('all');
                  setDateRange(undefined);
                  setPage(1);
                }}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Clear all filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>
            {pagination
              ? `Showing ${requests.length} of ${pagination.total} total requests`
              : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequestsTable
            requests={requests}
            onDelete={handleDelete}
            onApprove={handleApprove}
            onReject={handleReject}
            isDeleting={isDeleting}
            isApproving={isApproving}
            isRejecting={isRejecting}
            requesterSearch={requesterSearch}
            mediaTypeFilter={mediaTypeFilter}
            dateRange={dateRange}
          />

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this request from the database. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRequestToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-500 hover:bg-red-600"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve Confirmation Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Request</AlertDialogTitle>
            <AlertDialogDescription>
              This will approve the request and submit it to the media service. The requester will
              be notified via WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRequestToApprove(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmApprove}
              className="bg-green-600 hover:bg-green-700"
              disabled={isApproving}
            >
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Request</AlertDialogTitle>
            <AlertDialogDescription>
              This will reject the request. The requester will be notified via WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-reason" className="text-sm font-medium">
              Reason (optional)
            </Label>
            <Input
              id="reject-reason"
              placeholder="Enter reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isRejecting) {
                  e.preventDefault();
                  confirmReject();
                }
              }}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setRequestToReject(null);
                setRejectReason('');
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReject}
              className="bg-orange-600 hover:bg-orange-700"
              disabled={isRejecting}
            >
              {isRejecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
