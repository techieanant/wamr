/**
 * Type of media (movie, TV series, or both for ambiguous searches)
 */
export type MediaType = 'movie' | 'series' | 'both';

/**
 * Service types that provide media search
 */
export type ServiceType = 'radarr' | 'sonarr' | 'seerr';

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

  // Overseerr media status (1=unknown,2=pending,3=processing,4=partial,5=available)
  // undefined means Overseerr has no record of this media (safe to request)
  mediaStatus?: number;
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
  // Populated by Overseerr when the media is known to the system
  // status: 1=unknown, 2=pending, 3=processing, 4=partially_available, 5=available
  mediaInfo?: {
    status: number;
  };
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
  source: ServiceType = 'seerr'
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
    // Carry Overseerr's media status so the conversation layer can block duplicate requests.
    // undefined = Overseerr has no record → safe to request.
    mediaStatus: result.mediaInfo?.status,
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
 * Sort mode for search results
 */
export type SortMode = 'relevance' | 'year-desc';

/**
 * Extract a 4-digit year hint (1900–2099) from the end of a query string.
 * Returns { cleanQuery, yearHint } where cleanQuery has the year stripped.
 */
export function extractYearHint(query: string): { cleanQuery: string; yearHint: number | null } {
  const match = query.trim().match(/^(.*?)\s*((?:19|20)\d{2})\s*$/);
  if (match) {
    return {
      cleanQuery: match[1].trim().toLowerCase(),
      yearHint: parseInt(match[2], 10),
    };
  }
  return { cleanQuery: query.trim().toLowerCase(), yearHint: null };
}

/**
 * Generate character trigrams from a string (padded with spaces).
 * Used for fuzzy title matching.
 */
export function getTrigrams(str: string): Set<string> {
  const padded = ` ${str.toLowerCase()} `;
  const trigrams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Score word overlap between query words and a normalized title.
 * A query word "matches" if any title word starts with that query word.
 * Returns a value in [0, 1].
 */
export function wordOverlapScore(queryWords: string[], titleNorm: string): number {
  if (queryWords.length === 0) return 0;
  const titleWords = titleNorm.split(/\s+/);
  let matches = 0;
  for (const qw of queryWords) {
    if (titleWords.some((tw) => tw.startsWith(qw))) matches++;
  }
  return matches / queryWords.length;
}

/**
 * Score trigram similarity between a normalized query and a normalized title.
 * Returns a value in [0, 1].
 */
export function trigramSimilarityScore(queryNorm: string, titleNorm: string): number {
  const queryTrigrams = getTrigrams(queryNorm);
  if (queryTrigrams.size === 0) return 0;
  const titleTrigrams = getTrigrams(titleNorm);
  let shared = 0;
  for (const t of queryTrigrams) {
    if (titleTrigrams.has(t)) shared++;
  }
  return shared / queryTrigrams.size;
}

/**
 * Compute a relevance score for a single result against a parsed query.
 *
 * Scoring tiers:
 *  +100 exact title match
 *  +60  title starts with full query
 *  0–50 word overlap (prefix matching)
 *  0–30 trigram similarity (handles typos)
 *  +20  year hint exact match
 *  +10  year hint within ±1
 *  0–10 title brevity bonus (shorter titles that still match score slightly higher)
 */
export function computeRelevanceScore(
  result: NormalizedResult,
  cleanQuery: string,
  queryWords: string[],
  yearHint: number | null
): number {
  const titleNorm = result.title.toLowerCase().trim();
  let score = 0;

  if (titleNorm === cleanQuery) {
    score += 100;
  } else if (titleNorm.startsWith(cleanQuery)) {
    score += 60;
  }

  score += wordOverlapScore(queryWords, titleNorm) * 50;
  score += trigramSimilarityScore(cleanQuery, titleNorm) * 30;

  if (yearHint !== null && result.year !== null) {
    if (result.year === yearHint) {
      score += 20;
    } else if (Math.abs(result.year - yearHint) === 1) {
      score += 10;
    }
  }

  // Brevity bonus: shorter titles score higher when query words match well.
  // This helps "Interstellar" beat "Interstellar Interference" for query "interst".
  // Max +10, proportional to how close the title length is to the query length.
  if (titleNorm.length > 0 && cleanQuery.length > 0) {
    const lengthRatio =
      Math.min(cleanQuery.length, titleNorm.length) / Math.max(cleanQuery.length, titleNorm.length);
    score += lengthRatio * 10;
  }

  return score;
}

/**
 * Rank results by relevance score descending, with year as tie-break.
 * Falls back to year-desc sort when mode is 'year-desc'.
 */
export function rankResults(
  results: NormalizedResult[],
  query: string,
  mode: SortMode
): NormalizedResult[] {
  if (mode === 'year-desc') {
    return sortResultsByYear(results);
  }

  const { cleanQuery, yearHint } = extractYearHint(query);
  const queryWords = cleanQuery.split(/\s+/).filter((w) => w.length > 0);

  return [...results].sort((a, b) => {
    const scoreA = computeRelevanceScore(a, cleanQuery, queryWords, yearHint);
    const scoreB = computeRelevanceScore(b, cleanQuery, queryWords, yearHint);
    if (scoreB !== scoreA) return scoreB - scoreA;
    // Tie-break: newer first
    return (b.year || 0) - (a.year || 0);
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
