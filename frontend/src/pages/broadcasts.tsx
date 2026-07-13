import { useState } from 'react';
import { useBroadcasts, useBroadcast } from '../hooks/use-broadcasts';
import { BroadcastForm } from '../components/broadcasts/broadcast-form';
import { BroadcastList } from '../components/broadcasts/broadcast-list';
import { BroadcastDetail } from '../components/broadcasts/broadcast-detail';
import type { ComposeBroadcastInput } from '../types/broadcast.types';

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

  const handleCreate = (data: ComposeBroadcastInput) => {
    createBroadcast(data, {
      onSuccess: () => {
        // list refreshes via invalidation
      },
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Broadcasts</h1>
        <p className="text-sm text-muted-foreground">
          Send messages to contacts, with scheduling and recurring options.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <BroadcastForm onSubmit={handleCreate} isSubmitting={isCreating} />
        <BroadcastList
          broadcasts={broadcasts}
          isLoading={isLoading}
          onView={(b) => setSelectedId(b.id)}
          onCancel={cancelBroadcast}
          onPause={pauseBroadcast}
          onResume={resumeBroadcast}
          onRetry={retryBroadcast}
          onDelete={deleteBroadcast}
        />
      </div>

      <BroadcastDetail
        broadcast={selectedId ? (detail ?? null) : null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
