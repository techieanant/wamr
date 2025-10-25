import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { AlertCircle, Filter, Trash2 } from 'lucide-react';
import type { MessageFilterType } from '../../types/whatsapp.types';

interface MessageFilterFormProps {
  currentFilterType: MessageFilterType;
  currentFilterValue: string | null;
  onSave: (filterType: MessageFilterType, filterValue: string | null) => void;
  isSaving?: boolean;
}

export function MessageFilterForm({
  currentFilterType,
  currentFilterValue,
  onSave,
  isSaving = false,
}: MessageFilterFormProps) {
  const [filterType, setFilterType] = useState<string>(currentFilterType || 'none');
  const [filterValue, setFilterValue] = useState<string>(currentFilterValue || '');

  const handleSave = () => {
    if (filterType === 'none') {
      onSave(null, null);
    } else {
      onSave(filterType as MessageFilterType, filterValue);
    }
  };

  const handleDelete = () => {
    setFilterType('none');
    setFilterValue('');
    onSave(null, null);
  };

  const isValid = filterType === 'none' || (filterValue.length >= 1 && filterValue.length <= 10);
  const hasFilter = currentFilterType !== null;

  const getDescription = () => {
    if (filterType === 'prefix') {
      return 'Messages must start with this prefix. The prefix will be removed before processing. Example: "#" means "#Inception" becomes "Inception".';
    } else if (filterType === 'keyword') {
      return 'Messages must contain this keyword (case-insensitive). The keyword will be removed before processing. Example: "bot" means "bot search Inception" becomes "search Inception".';
    } else {
      return 'Select a filter type to configure message filtering. Without a filter, all messages will be processed.';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Message Filtering
            </CardTitle>
            <CardDescription className="mt-2">
              Configure which messages should be processed by the bot
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Filter Status */}
        {hasFilter && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Current Filter: {currentFilterType === 'prefix' ? 'Prefix' : 'Keyword'} "
              {currentFilterValue}"
            </p>
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
              {currentFilterType === 'prefix'
                ? `Only messages starting with "${currentFilterValue}" will be processed`
                : `Only messages containing "${currentFilterValue}" will be processed`}
            </p>
          </div>
        )}

        {/* Filter Type Selection */}
        <div className="space-y-2">
          <Label htmlFor="filter-type">Filter Type</Label>
          <select
            id="filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="none">None (Process all messages)</option>
            <option value="prefix">Prefix (Must start with)</option>
            <option value="keyword">Keyword (Must contain)</option>
          </select>
        </div>

        {/* Filter Value Input */}
        {filterType !== 'none' && (
          <div className="space-y-2">
            <Label htmlFor="filter-value">
              {filterType === 'prefix' ? 'Prefix' : 'Keyword'} (1-10 characters)
            </Label>
            <Input
              id="filter-value"
              type="text"
              placeholder={filterType === 'prefix' ? 'e.g., #' : 'e.g., bot'}
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              maxLength={10}
              className="font-mono"
            />
            {filterValue.length > 0 && (
              <p className="text-xs text-muted-foreground">{filterValue.length}/10 characters</p>
            )}
          </div>
        )}

        {/* Description */}
        <div className="flex items-start gap-2 rounded-lg bg-muted p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{getDescription()}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={!isValid || isSaving} className="flex-1">
            {isSaving ? 'Saving...' : 'Save Filter'}
          </Button>
          {hasFilter && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSaving}
              className="flex gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Remove Filter
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
