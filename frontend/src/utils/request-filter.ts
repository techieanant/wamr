import type { MediaRequest } from '../types/request.types';
import type { DateRange } from 'react-day-picker';

interface Filters {
  search?: string;
  mediaType?: 'all' | 'movie' | 'series';
  dateRange?: DateRange | undefined;
}

export function filterRequests(requests: MediaRequest[], filters: Filters) {
  const { search = '', mediaType = 'all', dateRange } = filters;

  return requests.filter((request) => {
    // Search filter (name, number, or media title)
    if (search) {
      const searchLower = search.toLowerCase();
      const nameMatch = request.contactName?.toLowerCase().includes(searchLower);
      const phoneMatch = request.requesterPhone?.toLowerCase().includes(searchLower);
      const titleMatch = request.title?.toLowerCase().includes(searchLower);
      if (!nameMatch && !phoneMatch && !titleMatch) return false;
    }

    // Media type filter
    if (mediaType !== 'all' && request.mediaType !== mediaType) {
      return false;
    }

    // Date range filter (inclusive) - fallback to createdAt when submittedAt is missing
    if (dateRange?.from || dateRange?.to) {
      const requestDateString = request.submittedAt ?? request.createdAt;
      if (!requestDateString) return false;
      const requestDate = new Date(requestDateString);

      // Use UTC-based YMD comparison to be timezone-agnostic and inclusive
      const getYMD = (d: Date) => [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()];
      const compareYMD = getYMD(requestDate);

      if (dateRange.from) {
        const fromDate = new Date(dateRange.from);
        const fromYMD = getYMD(fromDate);
        // if request < from => exclude
        if (
          compareYMD[0] < fromYMD[0] ||
          (compareYMD[0] === fromYMD[0] && compareYMD[1] < fromYMD[1]) ||
          (compareYMD[0] === fromYMD[0] &&
            compareYMD[1] === fromYMD[1] &&
            compareYMD[2] < fromYMD[2])
        ) {
          return false;
        }
      }

      if (dateRange.to) {
        const toDate = new Date(dateRange.to);
        const toYMD = getYMD(toDate);
        // if request > to => exclude
        if (
          compareYMD[0] > toYMD[0] ||
          (compareYMD[0] === toYMD[0] && compareYMD[1] > toYMD[1]) ||
          (compareYMD[0] === toYMD[0] && compareYMD[1] === toYMD[1] && compareYMD[2] > toYMD[2])
        ) {
          return false;
        }
      }
    }

    return true;
  });
}
