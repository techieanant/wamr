import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useBroadcastContacts } from '../../hooks/use-broadcasts';
import type { ComposeBroadcastInput, RecurringPattern } from '../../types/broadcast.types';

interface BroadcastFormProps {
  onSubmit: (data: ComposeBroadcastInput) => void;
  isSubmitting: boolean;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function BroadcastForm({ onSubmit, isSubmitting }: BroadcastFormProps) {
  const { data: contactsData } = useBroadcastContacts();
  const contacts = contactsData?.contacts ?? [];

  const [label, setLabel] = useState('');
  const [messageText, setMessageText] = useState('');
  const [scheduleType, setScheduleType] = useState<'once' | 'recurring'>('once');
  const [selected, setSelected] = useState<number[]>([]);
  const [sendAt, setSendAt] = useState('');
  const [recurringPattern, setRecurringPattern] = useState<RecurringPattern>('daily');
  const [recurringTime, setRecurringTime] = useState('09:00');
  const [recurringWeekday, setRecurringWeekday] = useState(1);
  const [recurringMonthDay, setRecurringMonthDay] = useState(1);
  const [recurringInterval, setRecurringInterval] = useState(1);
  const [throttleMs, setThrottleMs] = useState(2500);
  const [jitterMs, setJitterMs] = useState(500);
  const [error, setError] = useState<string | null>(null);

  const selectable = contacts.filter((c) => c.phoneNumber);
  const allSelected = selectable.length > 0 && selected.length === selectable.length;

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelected(allSelected ? [] : selectable.map((c) => c.id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) {
      setError('Message text is required');
      return;
    }
    if (selected.length === 0) {
      setError('Select at least one recipient');
      return;
    }
    setError(null);

    const payload: ComposeBroadcastInput = {
      label: label.trim() || undefined,
      messageText: messageText.trim(),
      scheduleType,
      recipientContactIds: selected,
      throttleMs,
      jitterMs,
    };
    if (scheduleType === 'once') {
      payload.sendAt = sendAt ? new Date(sendAt).toISOString() : undefined;
    } else {
      payload.recurringPattern = recurringPattern;
      payload.recurringTime = recurringTime;
      if (recurringPattern === 'weekly') payload.recurringWeekday = recurringWeekday;
      if (recurringPattern === 'monthly') payload.recurringMonthDay = recurringMonthDay;
      if (recurringPattern === 'minute' || recurringPattern === 'hour')
        payload.recurringInterval = recurringInterval;
    }
    onSubmit(payload);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Broadcast</CardTitle>
        <CardDescription>
          Send a message to selected contacts. Use <code>{'{name}'}</code> to personalize.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="label">Label (optional)</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Weekly update"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="message">Message</Label>
            <textarea
              id="message"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              rows={4}
              maxLength={4096}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Hello {name}, here is your update!"
            />
            <p className="text-xs text-muted-foreground">{messageText.length}/4096</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Recipients ({selected.length} selected)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleAll}
                disabled={selectable.length === 0}
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </Button>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {contacts.length === 0 && (
                <p className="text-sm text-muted-foreground">No contacts available.</p>
              )}
              {contacts.map((c) => {
                const disabled = !c.phoneNumber;
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      disabled={disabled}
                      onChange={() => toggle(c.id)}
                    />
                    {c.contactName || `Contact #${c.id}`}
                    {disabled && <span className="text-xs text-muted-foreground">(no phone)</span>}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Schedule</Label>
            <Select
              value={scheduleType}
              onValueChange={(v) => setScheduleType(v as 'once' | 'recurring')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">One-time (send now or scheduled)</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scheduleType === 'once' ? (
            <div className="space-y-1">
              <Label htmlFor="sendAt">Send at (optional, defaults to now)</Label>
              <Input
                id="sendAt"
                type="datetime-local"
                value={sendAt}
                onChange={(e) => setSendAt(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Pattern</Label>
                <Select
                  value={recurringPattern}
                  onValueChange={(v) => setRecurringPattern(v as RecurringPattern)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="minute">Every minute</SelectItem>
                    <SelectItem value="hour">Every hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {recurringPattern === 'minute' || recurringPattern === 'hour' ? (
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="rinterval">Every</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="rinterval"
                      type="number"
                      min={1}
                      value={recurringInterval}
                      onChange={(e) => setRecurringInterval(Math.max(1, Number(e.target.value)))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">
                      {recurringPattern === 'minute' ? 'minute(s)' : 'hour(s)'}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="rtime">Time</Label>
                    <Input
                      id="rtime"
                      type="time"
                      value={recurringTime}
                      onChange={(e) => setRecurringTime(e.target.value)}
                    />
                  </div>
                  {recurringPattern === 'weekly' && (
                    <div className="col-span-2 space-y-1">
                      <Label>Weekday</Label>
                      <Select
                        value={String(recurringWeekday)}
                        onValueChange={(v) => setRecurringWeekday(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((d, i) => (
                            <SelectItem key={d} value={String(i)}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {recurringPattern === 'monthly' && (
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="mday">Day of month</Label>
                      <Input
                        id="mday"
                        type="number"
                        min={1}
                        max={28}
                        value={recurringMonthDay}
                        onChange={(e) => setRecurringMonthDay(Number(e.target.value))}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="throttle">Throttle (ms)</Label>
              <Input
                id="throttle"
                type="number"
                min={0}
                value={throttleMs}
                onChange={(e) => setThrottleMs(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="jitter">Jitter (ms)</Label>
              <Input
                id="jitter"
                type="number"
                min={0}
                value={jitterMs}
                onChange={(e) => setJitterMs(Number(e.target.value))}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Scheduling…' : 'Create Broadcast'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
