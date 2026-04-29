import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { MessageCircle } from 'lucide-react';

interface MessageSourcesCardProps {
  processFromSelf: boolean;
  processGroups: boolean;
  onSave: (processFromSelf: boolean, processGroups: boolean) => void;
  isSaving?: boolean;
}

export function MessageSourcesCard({
  processFromSelf,
  processGroups,
  onSave,
  isSaving = false,
}: MessageSourcesCardProps) {
  const handleFromSelfChange = (checked: boolean) => {
    onSave(checked, processGroups);
  };

  const handleGroupsChange = (checked: boolean) => {
    onSave(processFromSelf, checked);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Message sources
        </CardTitle>
        <CardDescription>
          By default only 1:1 chats from others are processed. Enable these to also process messages
          from yourself or from groups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="process-from-self">Process messages from myself</Label>
            <p className="text-sm text-muted-foreground">
              When on, messages you send to the linked number (e.g. from another device) are
              processed.
            </p>
          </div>
          <Switch
            id="process-from-self"
            checked={processFromSelf}
            disabled={isSaving}
            onCheckedChange={handleFromSelfChange}
          />
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <div className="space-y-0.5">
            <Label htmlFor="process-groups">Process group messages</Label>
            <p className="text-sm text-muted-foreground">
              When on, messages in groups where the bot is added are processed; replies go to the
              group.
            </p>
          </div>
          <Switch
            id="process-groups"
            checked={processGroups}
            disabled={isSaving}
            onCheckedChange={handleGroupsChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
