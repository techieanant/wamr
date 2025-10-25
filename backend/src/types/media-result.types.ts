/**
 * Type of media (movie, TV series, or both for ambiguous searches)
 */
export type MediaType = 'movie' | 'series' | 'both';

/**
 * Service types that provide media search
 */
export type ServiceType = 'radarr' | 'sonarr' | 'overseerr';

/**
 * Normalized search result structure
 * All media search services return results in this unified format
 */
export interface NormalizedResult {
  // Basic information
  title: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;

  // External IDs
  tmdbId: number | null;
  tvdbId: number | null;
  imdbId: string | null;

  // Media type
  mediaType: MediaType;

  // TV series specific fields
  seasonCount?: number;

  // Source information (for debugging/logging)
  source?: ServiceType;
}

/**
 * Raw Radarr movie search result
 */
export interface RadarrMovieResult {
  title: string;
  year: number;
  overview: string;
  images: Array<{
    coverType: string;
    url: string;
  }>;
  tmdbId: number;
  imdbId?: string;
}

/**
 * Raw Sonarr series search result
 */
export interface SonarrSeriesResult {
  title: string;
  year: number;
  overview: string;
  images: Array<{
    coverType: string;
    url: string;
  }>;
  tvdbId: number;
  imdbId?: string;
  seasonCount?: number;
}

/**
 * Raw Overseerr search result
 */
export interface OverseerrSearchResult {
  id: number;
  mediaType: 'movie' | 'tv';
  title?: string; // For movies
  name?: string; // For TV series
  releaseDate?: string; // For movies
  firstAirDate?: string; // For TV series
  overview: string;
  posterPath: string | null;
  externalIds?: {
    imdbId?: string;
    tvdbId?: number;
  };
  numberOfSeasons?: number; // For TV series
}

/**
 * Search result deduplication key
 */
export interface DeduplicationKey {
  tmdbId?: number | null;
  tvdbId?: number | null;
  title: string;
  year: number | null;
}

/**
 * Helper to normalize Radarr movie result
 */
export function normalizeRadarrResult(
  result: RadarrMovieResult,
  source: ServiceType = 'radarr'
): NormalizedResult {
  const posterImage = result.images?.find((img) => img.coverType === 'poster');

  return {
    title: result.title,
    year: result.year,
    overview: result.overview || null,
    posterPath: posterImage?.url || null,
    tmdbId: result.tmdbId || null,
    tvdbId: null,
    imdbId: result.imdbId || null,
    mediaType: 'movie',
    source,
  };
}

/**
 * Helper to normalize Sonarr series result
 */
export function normalizeSonarrResult(
  result: SonarrSeriesResult,
  source: ServiceType = 'sonarr'
): NormalizedResult {
  const posterImage = result.images?.find((img) => img.coverType === 'poster');

  return {
    title: result.title,
    year: result.year,
    overview: result.overview || null,
    posterPath: posterImage?.url || null,
    tmdbId: null,
    tvdbId: result.tvdbId || null,
    imdbId: result.imdbId || null,
    mediaType: 'series',
    seasonCount: result.seasonCount,
    source,
  };
}

/**
 * Helper to normalize Overseerr result
 */
export function normalizeOverseerrResult(
  result: OverseerrSearchResult,
  source: ServiceType = 'overseerr'
): NormalizedResult {
  const mediaType = result.mediaType === 'movie' ? 'movie' : 'series';
  const title = result.title || result.name || 'Unknown';
  const dateString = result.releaseDate || result.firstAirDate;
  const year = dateString ? new Date(dateString).getFullYear() : null;

  return {
    title,
    year,
    overview: result.overview || null,
    posterPath: result.posterPath || null,
    tmdbId: result.id || null,
    tvdbId: result.externalIds?.tvdbId || null,
    imdbId: result.externalIds?.imdbId || null,
    mediaType,
    seasonCount: result.numberOfSeasons,
    source,
  };
}

/**
 * Helper to generate deduplication key from normalized result
 */
export function getDeduplicationKey(result: NormalizedResult): string {
  // Use tmdbId for movies, tvdbId for series, fall back to title+year
  if (result.mediaType === 'movie' && result.tmdbId) {
    return `movie:tmdb:${result.tmdbId}`;
  }
  if (result.mediaType === 'series' && result.tvdbId) {
    return `series:tvdb:${result.tvdbId}`;
  }
  // Fallback to title+year (case-insensitive)
  const normalizedTitle = result.title.toLowerCase().trim();
  return `${result.mediaType}:title:${normalizedTitle}:${result.year || 'unknown'}`;
}

/**
 * Helper to deduplicate search results
 * Keeps the first occurrence of each unique media item
 */
export function deduplicateResults(results: NormalizedResult[]): NormalizedResult[] {
  const seen = new Set<string>();
  const deduplicated: NormalizedResult[] = [];

  for (const result of results) {
    const key = getDeduplicationKey(result);
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(result);
    }
  }

  return deduplicated;
}

/**
 * Helper to sort results by year descending (most recent first)
 */
export function sortResultsByYear(results: NormalizedResult[]): NormalizedResult[] {
  return [...results].sort((a, b) => {
    const yearA = a.year || 0;
    const yearB = b.year || 0;
    return yearB - yearA;
  });
}

/**
 * Helper to limit results to maximum count
 */
export function limitResults(
  results: NormalizedResult[],
  maxResults: number = 5
): NormalizedResult[] {
  return results.slice(0, maxResults);
}

/**
 * Helper to format result for WhatsApp display
 */
export function formatResultForDisplay(result: NormalizedResult, index: number): string {
  const emoji = result.mediaType === 'movie' ? '🎬' : '📺';
  const yearStr = result.year ? ` (${result.year})` : '';
  const seasonInfo = result.seasonCount
    ? ` - ${result.seasonCount} season${result.seasonCount > 1 ? 's' : ''}`
    : '';

  // Add overview if available (truncate to 100 chars for WhatsApp readability)
  const overview = result.overview
    ? `\n   ${result.overview.length > 100 ? result.overview.substring(0, 100) + '...' : result.overview}`
    : '';

  return `${index}. ${emoji} ${result.title}${yearStr}${seasonInfo}${overview}`;
}
