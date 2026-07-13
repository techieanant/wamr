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

export function BroadcastList({
  broadcasts,
  isLoading,
  onView,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onDelete,
}: BroadcastListProps) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading broadcasts…</p>;
  if (broadcasts.length === 0)
    return <p className="text-sm text-muted-foreground">No broadcasts yet.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broadcasts</CardTitle>
      </CardHeader>
      <CardContent>
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
                  <div className="flex justify-end gap-1">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
