import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { Broadcast, BroadcastStatus } from '../../types/broadcast.types';

interface BroadcastListProps {
  broadcasts: Broadcast[];
  isLoading: boolean;
  onView: (b: Broadcast) => void;
  onCancel: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onRetry: (id: number) => void;
  onDelete: (id: number) => void;
  onExport: () => void;
}

const STATUS_VARIANT: Record<BroadcastStatus, 'default' | 'secondary' | 'destructive' | 'outline'> =
  {
    scheduled: 'outline',
    sending: 'secondary',
    completed: 'default',
    cancelled: 'destructive',
    paused: 'secondary',
    active: 'default',
  };

function fmt(dt: string | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleString();
}

function Actions({
  b,
  onView,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onDelete,
}: {
  b: Broadcast;
  onView: (b: Broadcast) => void;
  onCancel: (id: number) => void;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onRetry: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button variant="outline" size="sm" onClick={() => onView(b)}>
        View
      </Button>
      {b.status === 'scheduled' || b.status === 'active' ? (
        <Button variant="outline" size="sm" onClick={() => onCancel(b.id)}>
          Cancel
        </Button>
      ) : null}
      {b.status === 'active' ? (
        <Button variant="outline" size="sm" onClick={() => onPause(b.id)}>
          Pause
        </Button>
      ) : null}
      {b.status === 'paused' ? (
        <Button variant="outline" size="sm" onClick={() => onResume(b.id)}>
          Resume
        </Button>
      ) : null}
      {b.failedCount ? (
        <Button variant="outline" size="sm" onClick={() => onRetry(b.id)}>
          Retry
        </Button>
      ) : null}
      <Button variant="destructive" size="sm" onClick={() => onDelete(b.id)}>
        Delete
      </Button>
    </div>
  );
}

export function BroadcastList({
  broadcasts,
  isLoading,
  onView,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onDelete,
  onExport,
}: BroadcastListProps) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading broadcasts…</p>;
  if (broadcasts.length === 0)
    return <p className="text-sm text-muted-foreground">No broadcasts yet.</p>;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Broadcasts</CardTitle>
        <Button variant="outline" size="sm" onClick={onExport}>
          Download JSON
        </Button>
      </CardHeader>
      <CardContent>
        {/* Table on sm+ ; stacked cards on mobile to avoid horizontal scroll */}
        <div className="hidden overflow-x-auto sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Next / Sent</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.label || `Broadcast #${b.id}`}</TableCell>
                  <TableCell>{b.scheduleType === 'recurring' ? 'Recurring' : 'One-time'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {b.sentCount ?? 0}/{b.totalRecipients ?? 0}
                    {b.failedCount ? (
                      <span className="ml-1 text-destructive">({b.failedCount} failed)</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {b.scheduleType === 'recurring' ? fmt(b.nextRunAt) : fmt(b.sendAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Actions
                      b={b}
                      onView={onView}
                      onCancel={onCancel}
                      onPause={onPause}
                      onResume={onResume}
                      onRetry={onRetry}
                      onDelete={onDelete}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile stacked layout */}
        <div className="space-y-3 sm:hidden">
          {broadcasts.map((b) => (
            <div key={b.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.label || `Broadcast #${b.id}`}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.scheduleType === 'recurring' ? 'Recurring' : 'One-time'}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[b.status]}>{b.status}</Badge>
              </div>
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">Recipients: </span>
                {b.sentCount ?? 0}/{b.totalRecipients ?? 0}
                {b.failedCount ? (
                  <span className="ml-1 text-destructive">({b.failedCount} failed)</span>
                ) : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {b.scheduleType === 'recurring' ? 'Next: ' : 'Sent: '}
                {b.scheduleType === 'recurring' ? fmt(b.nextRunAt) : fmt(b.sendAt)}
              </p>
              <div className="mt-2">
                <Actions
                  b={b}
                  onView={onView}
                  onCancel={onCancel}
                  onPause={onPause}
                  onResume={onResume}
                  onRetry={onRetry}
                  onDelete={onDelete}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
