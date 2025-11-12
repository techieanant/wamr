import { describe, it, expect, vi } from 'vitest';
import { resultNormalizerService } from '../../../../src/services/media-search/result-normalizer';
import type {
  NormalizedResult,
  RadarrMovieResult,
  SonarrSeriesResult,
  OverseerrSearchResult,
} from '../../../../src/types/media-result.types';

// Mock logger
vi.mock('../../../../src/config/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ResultNormalizerService', () => {
  describe('normalizeRadarrResults', () => {
    it('should normalize valid Radarr results', () => {
      const radarrResults: RadarrMovieResult[] = [
        {
          title: 'Inception',
          year: 2010,
          overview: 'A mind-bending thriller',
          images: [
            { coverType: 'poster', url: '/poster.jpg' },
            { coverType: 'fanart', url: '/fanart.jpg' },
          ],
          tmdbId: 27205,
          imdbId: 'tt1375666',
        },
        {
          title: 'The Dark Knight',
          year: 2008,
          overview: 'Batman fights crime',
          images: [{ coverType: 'poster', url: '/dark-knight-poster.jpg' }],
          tmdbId: 155,
        },
      ];

      const normalized = resultNormalizerService.normalizeRadarrResults(radarrResults);

      expect(normalized).toHaveLength(2);
      expect(normalized[0]).toEqual({
        title: 'Inception',
        year: 2010,
        overview: 'A mind-bending thriller',
        posterPath: '/poster.jpg',
        tmdbId: 27205,
        tvdbId: null,
        imdbId: 'tt1375666',
        mediaType: 'movie',
        source: 'radarr',
      });
      expect(normalized[1]).toEqual({
        title: 'The Dark Knight',
        year: 2008,
        overview: 'Batman fights crime',
        posterPath: '/dark-knight-poster.jpg',
        tmdbId: 155,
        tvdbId: null,
        imdbId: null,
        mediaType: 'movie',
        source: 'radarr',
      });
    });

    it('should handle results without poster images', () => {
      const radarrResults: RadarrMovieResult[] = [
        {
          title: 'No Poster Movie',
          year: 2020,
          overview: 'A movie without poster',
          images: [],
          tmdbId: 12345,
        },
      ];

      const normalized = resultNormalizerService.normalizeRadarrResults(radarrResults);

      expect(normalized[0].posterPath).toBeNull();
    });

    it('should handle empty results array', () => {
      const normalized = resultNormalizerService.normalizeRadarrResults([]);
      expect(normalized).toEqual([]);
    });

    it('should use custom source', () => {
      const radarrResults: RadarrMovieResult[] = [
        {
          title: 'Test Movie',
          year: 2020,
          overview: 'Test overview',
          images: [],
          tmdbId: 12345,
        },
      ];

      const normalized = resultNormalizerService.normalizeRadarrResults(radarrResults, 'overseerr');

      expect(normalized[0].source).toBe('overseerr');
    });
  });

  describe('normalizeSonarrResults', () => {
    it('should normalize valid Sonarr results', () => {
      const sonarrResults: SonarrSeriesResult[] = [
        {
          title: 'Breaking Bad',
          year: 2008,
          overview: 'A chemistry teacher turns to crime',
          images: [{ coverType: 'poster', url: '/breaking-bad-poster.jpg' }],
          tvdbId: 81189,
          imdbId: 'tt0903747',
          seasonCount: 5,
        },
        {
          title: 'Stranger Things',
          year: 2016,
          overview: 'Kids face supernatural forces',
          images: [{ coverType: 'poster', url: '/stranger-things-poster.jpg' }],
          tvdbId: 305288,
        },
      ];

      const normalized = resultNormalizerService.normalizeSonarrResults(sonarrResults);

      expect(normalized).toHaveLength(2);
      expect(normalized[0]).toEqual({
        title: 'Breaking Bad',
        year: 2008,
        overview: 'A chemistry teacher turns to crime',
        posterPath: '/breaking-bad-poster.jpg',
        tmdbId: null,
        tvdbId: 81189,
        imdbId: 'tt0903747',
        mediaType: 'series',
        seasonCount: 5,
        source: 'sonarr',
      });
      expect(normalized[1]).toEqual({
        title: 'Stranger Things',
        year: 2016,
        overview: 'Kids face supernatural forces',
        posterPath: '/stranger-things-poster.jpg',
        tmdbId: null,
        tvdbId: 305288,
        imdbId: null,
        mediaType: 'series',
        source: 'sonarr',
      });
    });

    it('should handle results without season count', () => {
      const sonarrResults: SonarrSeriesResult[] = [
        {
          title: 'Series Without Season Count',
          year: 2020,
          overview: 'A series',
          images: [],
          tvdbId: 12345,
        },
      ];

      const normalized = resultNormalizerService.normalizeSonarrResults(sonarrResults);

      expect(normalized[0].seasonCount).toBeUndefined();
    });
  });

  describe('normalizeOverseerrResults', () => {
    it('should normalize movie results from Overseerr', () => {
      const overseerrResults: OverseerrSearchResult[] = [
        {
          id: 27205,
          mediaType: 'movie',
          title: 'Inception',
          releaseDate: '2010-07-16',
          overview: 'A mind-bending thriller',
          posterPath: '/poster.jpg',
          externalIds: {
            imdbId: 'tt1375666',
          },
        },
      ];

      const normalized = resultNormalizerService.normalizeOverseerrResults(overseerrResults);

      expect(normalized).toHaveLength(1);
      expect(normalized[0]).toEqual({
        title: 'Inception',
        year: 2010,
        overview: 'A mind-bending thriller',
        posterPath: '/poster.jpg',
        tmdbId: 27205,
        tvdbId: null,
        imdbId: 'tt1375666',
        mediaType: 'movie',
        source: 'overseerr',
      });
    });

    it('should normalize TV series results from Overseerr', () => {
      const overseerrResults: OverseerrSearchResult[] = [
        {
          id: 1399,
          mediaType: 'tv',
          name: 'Game of Thrones',
          firstAirDate: '2011-04-17',
          overview: 'Noble families vie for control',
          posterPath: '/got-poster.jpg',
          externalIds: {
            tvdbId: 121361,
          },
          numberOfSeasons: 8,
        },
      ];

      const normalized = resultNormalizerService.normalizeOverseerrResults(overseerrResults);

      expect(normalized).toHaveLength(1);
      expect(normalized[0]).toEqual({
        title: 'Game of Thrones',
        year: 2011,
        overview: 'Noble families vie for control',
        posterPath: '/got-poster.jpg',
        tmdbId: 1399,
        tvdbId: 121361,
        imdbId: null,
        mediaType: 'series',
        seasonCount: 8,
        source: 'overseerr',
      });
    });

    it('should handle results without external IDs', () => {
      const overseerrResults: OverseerrSearchResult[] = [
        {
          id: 12345,
          mediaType: 'movie',
          title: 'No External IDs',
          releaseDate: '2020-06-15',
          overview: 'A movie without external IDs',
          posterPath: null,
        },
      ];

      const normalized = resultNormalizerService.normalizeOverseerrResults(overseerrResults);

      expect(normalized[0]).toEqual({
        title: 'No External IDs',
        year: 2020,
        overview: 'A movie without external IDs',
        posterPath: null,
        tmdbId: 12345,
        tvdbId: null,
        imdbId: null,
        mediaType: 'movie',
        seasonCount: undefined,
        source: 'overseerr',
      });
    });

    it('should handle results without dates', () => {
      const overseerrResults: OverseerrSearchResult[] = [
        {
          id: 12345,
          mediaType: 'movie',
          title: 'No Date Movie',
          overview: 'A movie without release date',
          posterPath: '/poster.jpg',
        },
      ];

      const normalized = resultNormalizerService.normalizeOverseerrResults(overseerrResults);

      expect(normalized[0].year).toBeNull();
    });

    it('should use name field for TV series when title is not available', () => {
      const overseerrResults: OverseerrSearchResult[] = [
        {
          id: 12345,
          mediaType: 'tv',
          name: 'Series Name',
          firstAirDate: '2020-01-01',
          overview: 'A TV series',
          posterPath: '/poster.jpg',
        },
      ];

      const normalized = resultNormalizerService.normalizeOverseerrResults(overseerrResults);

      expect(normalized[0].title).toBe('Series Name');
    });

    it('should use default title for malformed results', () => {
      const overseerrResults: OverseerrSearchResult[] = [
        {
          id: 12345,
          mediaType: 'movie',
          // No title or name
          overview: 'A movie',
          posterPath: '/poster.jpg',
        },
      ];

      const normalized = resultNormalizerService.normalizeOverseerrResults(overseerrResults);

      expect(normalized[0].title).toBe('Unknown');
    });
  });

  describe('processResults', () => {
    const mockResults: NormalizedResult[] = [
      {
        title: 'Movie A',
        year: 2020,
        mediaType: 'movie',
        tmdbId: 1,
        overview: 'Movie A overview',
        posterPath: '/poster-a.jpg',
        source: 'radarr',
        tvdbId: null,
        imdbId: null,
      },
      {
        title: 'Movie B',
        year: 2019,
        mediaType: 'movie',
        tmdbId: 2,
        overview: 'Movie B overview',
        posterPath: '/poster-b.jpg',
        source: 'radarr',
        tvdbId: null,
        imdbId: null,
      },
      {
        title: 'Series A',
        year: 2021,
        mediaType: 'series',
        tvdbId: 100,
        overview: 'Series A overview',
        posterPath: '/series-a.jpg',
        source: 'sonarr',
        tmdbId: null,
        imdbId: null,
      },
    ];

    it('should deduplicate and sort results by year', () => {
      // Create duplicate results
      const duplicateResults = [
        ...mockResults,
        { ...mockResults[0] }, // Duplicate of Movie A
      ];

      const processed = resultNormalizerService.processResults(duplicateResults, 10);

      expect(processed).toHaveLength(3);
      // Should be sorted by year descending
      expect(processed[0].year).toBe(2021); // Series A
      expect(processed[1].year).toBe(2020); // Movie A
      expect(processed[2].year).toBe(2019); // Movie B
    });

    it('should limit results to maxResults', () => {
      const processed = resultNormalizerService.processResults(mockResults, 2);

      expect(processed).toHaveLength(2);
      expect(processed[0].title).toBe('Series A'); // 2021
      expect(processed[1].title).toBe('Movie A'); // 2020
    });

    it('should handle empty results', () => {
      const processed = resultNormalizerService.processResults([], 5);
      expect(processed).toEqual([]);
    });

    it('should handle null years (sort them last)', () => {
      const resultsWithNullYear = [
        ...mockResults,
        {
          title: 'Unknown Year Movie',
          year: null,
          mediaType: 'movie' as const,
          tmdbId: 999,
          overview: 'Unknown year',
          posterPath: '/unknown.jpg',
          source: 'overseerr' as const,
          tvdbId: null,
          imdbId: null,
        },
      ];

      const processed = resultNormalizerService.processResults(resultsWithNullYear, 10);

      expect(processed).toHaveLength(4);
      // Null year should be last
      expect(processed[3].title).toBe('Unknown Year Movie');
    });
  });

  describe('combineAndProcess', () => {
    const radarrResults: RadarrMovieResult[] = [
      {
        title: 'Radarr Movie',
        year: 2020,
        overview: 'From Radarr',
        images: [{ coverType: 'poster', url: '/radarr-poster.jpg' }],
        tmdbId: 100,
      },
    ];

    const sonarrResults: SonarrSeriesResult[] = [
      {
        title: 'Sonarr Series',
        year: 2021,
        overview: 'From Sonarr',
        images: [{ coverType: 'poster', url: '/sonarr-poster.jpg' }],
        tvdbId: 200,
        seasonCount: 3,
      },
    ];

    const overseerrResults: OverseerrSearchResult[] = [
      {
        id: 300,
        mediaType: 'movie',
        title: 'Overseerr Movie',
        releaseDate: '2019-01-01',
        overview: 'From Overseerr',
        posterPath: '/overseerr-poster.jpg',
      },
    ];

    it('should combine and process results from all sources', () => {
      const combined = resultNormalizerService.combineAndProcess(
        radarrResults,
        sonarrResults,
        overseerrResults,
        10
      );

      expect(combined).toHaveLength(3);
      // Should be sorted by year descending
      expect(combined[0].title).toBe('Sonarr Series'); // 2021
      expect(combined[1].title).toBe('Radarr Movie'); // 2020
      expect(combined[2].title).toBe('Overseerr Movie'); // 2019
    });

    it('should handle empty arrays for some sources', () => {
      const combined = resultNormalizerService.combineAndProcess(
        radarrResults,
        [], // No Sonarr results
        overseerrResults,
        10
      );

      expect(combined).toHaveLength(2);
      expect(combined[0].title).toBe('Radarr Movie');
      expect(combined[1].title).toBe('Overseerr Movie');
    });

    it('should handle all empty arrays', () => {
      const combined = resultNormalizerService.combineAndProcess([], [], [], 5);
      expect(combined).toEqual([]);
    });

    it('should limit combined results', () => {
      const combined = resultNormalizerService.combineAndProcess(
        radarrResults,
        sonarrResults,
        overseerrResults,
        2
      );

      expect(combined).toHaveLength(2);
    });
  });

  describe('isValidResult', () => {
    it('should return true for valid movie result', () => {
      const result: NormalizedResult = {
        title: 'Valid Movie',
        year: 2020,
        mediaType: 'movie',
        tmdbId: 12345,
        overview: 'Valid movie',
        posterPath: '/poster.jpg',
        source: 'radarr',
        tvdbId: null,
        imdbId: null,
      };

      expect(resultNormalizerService.isValidResult(result)).toBe(true);
    });

    it('should return true for valid series result', () => {
      const result: NormalizedResult = {
        title: 'Valid Series',
        year: 2020,
        mediaType: 'series',
        tvdbId: 12345,
        overview: 'Valid series',
        posterPath: '/poster.jpg',
        source: 'sonarr',
        tmdbId: null,
        imdbId: null,
      };

      expect(resultNormalizerService.isValidResult(result)).toBe(true);
    });

    it('should return true for result with title and year but no IDs', () => {
      const result: NormalizedResult = {
        title: 'Fallback Result',
        year: 2020,
        mediaType: 'movie',
        overview: 'Fallback result',
        posterPath: '/poster.jpg',
        source: 'overseerr',
        tmdbId: null,
        tvdbId: null,
        imdbId: null,
      };

      expect(resultNormalizerService.isValidResult(result)).toBe(true);
    });

    it('should return false for result without title', () => {
      const result: NormalizedResult = {
        title: '',
        year: 2020,
        mediaType: 'movie',
        tmdbId: 12345,
        overview: 'No title',
        posterPath: '/poster.jpg',
        source: 'radarr',
        tvdbId: null,
        imdbId: null,
      };

      expect(resultNormalizerService.isValidResult(result)).toBe(false);
    });

    it('should return false for result without required identifiers', () => {
      const result: NormalizedResult = {
        title: 'No IDs',
        year: null,
        mediaType: 'movie',
        overview: 'No identifiers',
        posterPath: '/poster.jpg',
        source: 'overseerr',
        tmdbId: null,
        tvdbId: null,
        imdbId: null,
      };

      expect(resultNormalizerService.isValidResult(result)).toBe(false);
    });
  });

  describe('filterValidResults', () => {
    it('should filter out invalid results', () => {
      const validResult: NormalizedResult = {
        title: 'Valid Movie',
        year: 2020,
        mediaType: 'movie',
        tmdbId: 12345,
        overview: 'Valid movie',
        posterPath: '/poster.jpg',
        source: 'radarr',
        tvdbId: null,
        imdbId: null,
      };

      const invalidResult: NormalizedResult = {
        title: '',
        year: 2020,
        mediaType: 'movie',
        tmdbId: 12345,
        overview: 'Invalid movie',
        posterPath: '/poster.jpg',
        source: 'radarr',
        tvdbId: null,
        imdbId: null,
      };

      const results = [validResult, invalidResult];
      const filtered = resultNormalizerService.filterValidResults(results);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toEqual(validResult);
    });

    it('should return all results if all are valid', () => {
      const results: NormalizedResult[] = [
        {
          title: 'Movie 1',
          year: 2020,
          mediaType: 'movie',
          tmdbId: 1,
          overview: 'Movie 1',
          posterPath: '/poster1.jpg',
          source: 'radarr',
          tvdbId: null,
          imdbId: null,
        },
        {
          title: 'Series 1',
          year: 2021,
          mediaType: 'series',
          tvdbId: 2,
          overview: 'Series 1',
          posterPath: '/poster2.jpg',
          source: 'sonarr',
          tmdbId: null,
          imdbId: null,
        },
      ];

      const filtered = resultNormalizerService.filterValidResults(results);
      expect(filtered).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const filtered = resultNormalizerService.filterValidResults([]);
      expect(filtered).toEqual([]);
    });
  });
});
