import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Bell } from 'lucide-react';

interface PhoneNotificationsCardProps {
  markOnlineOnConnect: boolean;
  onSave: (markOnlineOnConnect: boolean) => void;
  isSaving?: boolean;
}

export function PhoneNotificationsCard({
  markOnlineOnConnect,
  onSave,
  isSaving = false,
}: PhoneNotificationsCardProps) {
  const [localMarkOnline, setLocalMarkOnline] = useState(markOnlineOnConnect);

  // Keep local state in sync when the authoritative prop changes (e.g. after a successful save)
  useEffect(() => {
    setLocalMarkOnline(markOnlineOnConnect);
  }, [markOnlineOnConnect]);

  const handleChange = (checked: boolean) => {
    setLocalMarkOnline(checked);
    onSave(checked);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Phone notifications
        </CardTitle>
        <CardDescription>
          Control whether your phone shows unread badges and notifications while WAMR is connected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="mark-online-on-connect">Mark as online when connected</Label>
            <p className="text-sm text-muted-foreground">
              When on, your WhatsApp account appears online and your phone stops showing unread
              badges. When off (default), your phone receives notifications normally.
            </p>
            <p className="text-sm italic text-muted-foreground">
              Changes take effect on the next connect or reconnect.
            </p>
          </div>
          <Switch
            id="mark-online-on-connect"
            checked={localMarkOnline}
            disabled={isSaving}
            onCheckedChange={handleChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
