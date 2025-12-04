import { useMemo, useState, useEffect } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  VisibilityState,
} from '@tanstack/react-table';
import type { MediaRequest, RequestStatus } from '../../types/request.types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { CheckCircle, XCircle, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { DateRange } from 'react-day-picker';
import { filterRequests } from '../../utils/request-filter';

interface RequestsTableProps {
  requests: MediaRequest[];
  onDelete: (id: number) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  isDeleting: boolean;
  isApproving: boolean;
  isRejecting: boolean;
  requesterSearch?: string;
  mediaTypeFilter?: 'all' | 'movie' | 'series';
  dateRange?: DateRange;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
}

const COLUMN_VISIBILITY_KEY = 'requests-table-columns';

// Helper function to get status badge styling
const getStatusBadgeVariant = (status: RequestStatus): { class: string; label: string } => {
  const variants: Record<RequestStatus, { class: string; label: string }> = {
    PENDING: { class: 'bg-yellow-500 hover:bg-yellow-600', label: 'Pending' },
    SUBMITTED: { class: 'bg-blue-500 hover:bg-blue-600', label: 'Submitted' },
    APPROVED: { class: 'bg-green-500 hover:bg-green-600', label: 'Approved' },
    FAILED: { class: 'bg-red-500 hover:bg-red-600', label: 'Failed' },
    REJECTED: { class: 'bg-gray-500 hover:bg-gray-600', label: 'Rejected' },
  };
  return variants[status];
};

export function RequestsTable({
  requests,
  onDelete,
  onApprove,
  onReject,
  isDeleting,
  isApproving,
  isRejecting,
  requesterSearch = '',
  mediaTypeFilter = 'all',
  dateRange,
  onColumnVisibilityChange,
}: RequestsTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_VISIBILITY_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Save column visibility to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(columnVisibility));
    onColumnVisibilityChange?.(columnVisibility);
  }, [columnVisibility, onColumnVisibilityChange]);

  // Filter requests based on all active filters
  const filteredRequests = useMemo(() => {
    return filterRequests(requests, {
      search: requesterSearch,
      mediaType: mediaTypeFilter,
      dateRange,
    });
  }, [requests, requesterSearch, mediaTypeFilter, dateRange]);

  // Check if any filters are active
  const hasActiveFilters =
    requesterSearch || mediaTypeFilter !== 'all' || dateRange?.from || dateRange?.to;

  const columns = useMemo<ColumnDef<MediaRequest>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => <div className="font-mono text-sm">{row.getValue('id')}</div>,
      },
      {
        accessorKey: 'requesterPhone',
        header: () => <div className="text-center">Requester</div>,
        cell: ({ row }) => {
          const phone = row.getValue('requesterPhone') as string | undefined;
          const contactName = row.original.contactName;
          return (
            <div className="flex flex-col items-center space-y-1">
              {contactName && <div className="text-sm font-medium">{contactName}</div>}
              <div className="font-mono text-xs text-muted-foreground">{phone || '-'}</div>
            </div>
          );
        },
      },
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => {
          const title = row.getValue('title') as string;
          const year = row.original.year;
          return (
            <div className="font-medium">
              {title}
              {year && <span className="ml-2 text-muted-foreground">({year})</span>}
            </div>
          );
        },
      },
      {
        accessorKey: 'mediaType',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.getValue('mediaType') as string;
          const selectedSeasons = row.original.selectedSeasons;
          return (
            <div className="space-y-1">
              <Badge variant="outline">{type === 'movie' ? '🎬 Movie' : '📺 Series'}</Badge>
              {type === 'series' && selectedSeasons && selectedSeasons.length > 0 && (
                <div>
                  <Badge variant="secondary" className="text-xs">
                    {selectedSeasons.length === 1
                      ? `S${selectedSeasons[0]}`
                      : `${selectedSeasons.length} seasons`}
                  </Badge>
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'serviceType',
        header: 'Service',
        cell: ({ row }) => {
          const service = row.getValue('serviceType') as string | undefined;
          return service ? (
            <Badge variant="secondary" className="capitalize">
              {service}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as RequestStatus;
          const variant = getStatusBadgeVariant(status);
          return <Badge className={variant.class}>{variant.label}</Badge>;
        },
      },
      {
        accessorKey: 'submittedAt',
        header: 'Submitted',
        cell: ({ row }) => {
          const submittedAt = row.original.submittedAt;
          const createdAt = row.original.createdAt;
          const date = submittedAt ? new Date(submittedAt) : new Date(createdAt);
          return <div className="text-sm text-muted-foreground">{date.toLocaleDateString()}</div>;
        },
      },
      {
        accessorKey: 'errorMessage',
        header: 'Error Message',
        cell: ({ row }) => {
          const error = row.getValue('errorMessage') as string | undefined;
          return error ? (
            <div className="max-w-xs truncate text-sm text-red-600" title={error}>
              {error}
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        id: 'actions',
        header: () => <div className="text-center">Actions</div>,
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <div className="flex justify-center gap-1">
              {status === 'PENDING' && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onApprove(row.original.id)}
                    disabled={isApproving || isRejecting}
                    className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                    title="Approve request"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onReject(row.original.id)}
                    disabled={isApproving || isRejecting}
                    className="h-8 w-8 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                    title="Reject request"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(row.original.id)}
                disabled={isDeleting}
                className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                title="Delete request"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [onDelete, onApprove, onReject, isDeleting, isApproving, isRejecting]
  );

  const table = useReactTable({
    data: filteredRequests,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
  });

  return (
    <div className="space-y-4">
      {/* Column Visibility Toggle */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {table.getAllColumns().map((column) => {
              if (!column.getCanHide()) {
                return null;
              }

              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value: boolean) => column.toggleVisibility(!!value)}
                >
                  {column.columnDef.header && typeof column.columnDef.header === 'string'
                    ? column.columnDef.header
                    : column.id}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {filteredRequests.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {hasActiveFilters ? (
                    <div className="space-y-2">
                      <p>No requests match your filters</p>
                      <p className="text-sm">Showing 0 of {requests.length} requests</p>
                    </div>
                  ) : (
                    'No requests found'
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
