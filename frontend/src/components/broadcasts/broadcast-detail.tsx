import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { Broadcast } from '../../types/broadcast.types';

interface BroadcastDetailProps {
  broadcast: Broadcast | null;
  onClose: () => void;
}

const RECIPIENT_VARIANT = {
  pending: 'outline',
  sent: 'default',
  failed: 'destructive',
} as const;

export function BroadcastDetail({ broadcast, onClose }: BroadcastDetailProps) {
  return (
    <Dialog open={!!broadcast} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {broadcast && (
          <>
            <DialogHeader>
              <DialogTitle>{broadcast.label || `Broadcast #${broadcast.id}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Status: </span>
                <Badge variant="secondary">{broadcast.status}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Message: </span>
                <p className="mt-1 whitespace-pre-wrap rounded-md border p-2">
                  {broadcast.messageText}
                </p>
              </div>
              <div className="text-muted-foreground">
                Sent {broadcast.sentCount ?? 0} / {broadcast.totalRecipients ?? 0}
                {broadcast.failedCount ? ` · ${broadcast.failedCount} failed` : ''}
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent at</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(broadcast.recipients ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {r.contactName || r.phone || `Contact #${r.contactId}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={RECIPIENT_VARIANT[r.status]}>{r.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {r.sentAt ? new Date(r.sentAt).toLocaleString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(broadcast.recipients ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No recipient details loaded.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
