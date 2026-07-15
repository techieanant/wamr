import { useState } from 'react';
import { useBroadcasts, useBroadcast } from '../hooks/use-broadcasts';
import { useToast } from '../hooks/use-toast';
import { exportBroadcasts } from '../services/broadcasts.client';
import { BroadcastForm } from '../components/broadcasts/broadcast-form';
import { BroadcastList } from '../components/broadcasts/broadcast-list';
import { BroadcastDetail } from '../components/broadcasts/broadcast-detail';
import type { ComposeBroadcastInput } from '../types/broadcast.types';

function downloadBroadcastsJson(data: { broadcasts: unknown[]; exportedAt: string }): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `broadcasts-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function BroadcastsPage() {
  const {
    broadcasts,
    isLoading,
    createBroadcast,
    cancelBroadcast,
    pauseBroadcast,
    resumeBroadcast,
    retryBroadcast,
    deleteBroadcast,
    isCreating,
  } = useBroadcasts();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = useBroadcast(selectedId ?? 0);
  const { toast } = useToast();

  const handleCreate = (data: ComposeBroadcastInput) => {
    createBroadcast(data, {
      onSuccess: () => {
        // list refreshes via invalidation
      },
    });
  };

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">Broadcasts</h1>
        <p className="text-sm text-muted-foreground">
          Send messages to contacts, with scheduling and recurring options.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="min-w-0">
          <BroadcastForm onSubmit={handleCreate} isSubmitting={isCreating} />
        </div>
        <div className="min-w-0">
          <BroadcastList
            broadcasts={broadcasts}
            isLoading={isLoading}
            onView={(b) => setSelectedId(b.id)}
            onCancel={cancelBroadcast}
            onPause={pauseBroadcast}
            onResume={resumeBroadcast}
            onRetry={retryBroadcast}
            onDelete={deleteBroadcast}
            onExport={() =>
              exportBroadcasts()
                .then(downloadBroadcastsJson)
                .catch(() => toast({ title: 'Export failed', variant: 'destructive' }))
            }
          />
        </div>
      </div>

      <BroadcastDetail
        broadcast={selectedId ? (detail ?? null) : null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
