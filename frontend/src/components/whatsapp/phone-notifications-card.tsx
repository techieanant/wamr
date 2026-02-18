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
  const handleChange = (checked: boolean) => {
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
          Control whether your linked session appears &quot;online&quot; when WAMR is connected.
          When off (recommended), your phone keeps getting notifications and unread badges while
          WAMR still receives and processes messages.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="mark-online">Mark as online when connected</Label>
            <p className="text-sm text-muted-foreground">
              When on, the linked session appears online and WhatsApp may stop sending notifications
              to your phone and clear unread badges. Turn off to keep getting notifications on your
              phone while WAMR still receives and processes messages.
            </p>
          </div>
          <Switch
            id="mark-online"
            checked={markOnlineOnConnect}
            disabled={isSaving}
            onCheckedChange={handleChange}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Changes apply on next connect or reconnect.
        </p>
      </CardContent>
    </Card>
  );
}
