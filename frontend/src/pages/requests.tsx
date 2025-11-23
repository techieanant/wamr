import { useState, useEffect } from 'react';
import { useRequests } from '../hooks/use-requests';
import { useToast } from '../hooks/use-toast';
import type { RequestStatus } from '../types/request.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
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
import { Loader2, Trash2, Filter, FileText, CheckCircle, XCircle } from 'lucide-react';

export default function RequestsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'ALL'>('ALL');
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

  const getStatusBadge = (status: RequestStatus) => {
    const variants: Record<RequestStatus, { class: string; label: string }> = {
      PENDING: { class: 'bg-yellow-500 hover:bg-yellow-600', label: 'Pending' },
      SUBMITTED: { class: 'bg-blue-500 hover:bg-blue-600', label: 'Submitted' },
      APPROVED: { class: 'bg-green-500 hover:bg-green-600', label: 'Approved' },
      FAILED: { class: 'bg-red-500 hover:bg-red-600', label: 'Failed' },
      REJECTED: { class: 'bg-gray-500 hover:bg-gray-600', label: 'Rejected' },
    };

    const variant = variants[status];
    return <Badge className={variant.class}>{variant.label}</Badge>;
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
        <CardContent className="flex gap-4">
          <div className="max-w-xs flex-1">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No requests found
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-mono">{request.id}</TableCell>
                    <TableCell className="font-medium">
                      {request.title}
                      {request.year && (
                        <span className="ml-2 text-muted-foreground">({request.year})</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {request.mediaType === 'movie' ? '🎬 Movie' : '📺 Series'}
                      </Badge>
                      {request.mediaType === 'series' &&
                        request.selectedSeasons &&
                        request.selectedSeasons.length > 0 && (
                          <div className="mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {request.selectedSeasons.length === 1
                                ? `S${request.selectedSeasons[0]}`
                                : `${request.selectedSeasons.length} seasons`}
                            </Badge>
                          </div>
                        )}
                    </TableCell>
                    <TableCell>
                      {request.serviceType ? (
                        <Badge variant="secondary" className="capitalize">
                          {request.serviceType}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {request.submittedAt
                        ? new Date(request.submittedAt).toLocaleDateString()
                        : new Date(request.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {request.status === 'PENDING' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleApprove(request.id)}
                              disabled={isApproving || isRejecting}
                              className="text-green-600 hover:bg-green-50 hover:text-green-700"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReject(request.id)}
                              disabled={isApproving || isRejecting}
                              className="text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(request.id)}
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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
