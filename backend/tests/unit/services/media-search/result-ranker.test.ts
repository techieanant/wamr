import { describe, it, expect } from 'vitest';
import {
  rankResults,
  extractYearHint,
  getTrigrams,
  wordOverlapScore,
  trigramSimilarityScore,
  computeRelevanceScore,
} from '../../../../src/types/media-result.types';
import type { NormalizedResult } from '../../../../src/types/media-result.types';

function makeResult(
  title: string,
  year: number | null,
  mediaType: 'movie' | 'series' = 'movie'
): NormalizedResult {
  return {
    title,
    year,
    overview: null,
    posterPath: null,
    tmdbId: null,
    tvdbId: null,
    imdbId: null,
    mediaType,
  };
}

// ---------------------------------------------------------------------------
// extractYearHint
// ---------------------------------------------------------------------------
describe('extractYearHint', () => {
  it('extracts year from "interstellar 2014"', () => {
    const result = extractYearHint('interstellar 2014');
    expect(result.cleanQuery).toBe('interstellar');
    expect(result.yearHint).toBe(2014);
  });

  it('extracts year from "breaking bad 2008"', () => {
    const result = extractYearHint('breaking bad 2008');
    expect(result.cleanQuery).toBe('breaking bad');
    expect(result.yearHint).toBe(2008);
  });

  it('returns null yearHint when no year present', () => {
    const result = extractYearHint('the last of us');
    expect(result.cleanQuery).toBe('the last of us');
    expect(result.yearHint).toBeNull();
  });

  it('does not extract years outside 1900–2099', () => {
    expect(extractYearHint('movie 1899').yearHint).toBeNull();
    expect(extractYearHint('movie 2100').yearHint).toBeNull();
  });

  it('lowercases the clean query', () => {
    const result = extractYearHint('Interstellar 2014');
    expect(result.cleanQuery).toBe('interstellar');
  });
});

// ---------------------------------------------------------------------------
// getTrigrams
// ---------------------------------------------------------------------------
describe('getTrigrams', () => {
  it('generates expected trigrams for "cat"', () => {
    const trigrams = getTrigrams('cat');
    expect(trigrams.has(' ca')).toBe(true);
    expect(trigrams.has('cat')).toBe(true);
    expect(trigrams.has('at ')).toBe(true);
  });

  it('produces a non-empty set for a single character', () => {
    const trigrams = getTrigrams('a');
    expect(trigrams.size).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// wordOverlapScore
// ---------------------------------------------------------------------------
describe('wordOverlapScore', () => {
  it('returns 1.0 for exact match "breaking bad"', () => {
    expect(wordOverlapScore(['breaking', 'bad'], 'breaking bad')).toBe(1.0);
  });

  it('returns 1.0 for prefix match "interst" → "interstellar"', () => {
    expect(wordOverlapScore(['interst'], 'interstellar')).toBe(1.0);
  });

  it('returns 0.5 when only one of two query words matches', () => {
    expect(wordOverlapScore(['breaking', 'bad'], 'now we are breaking up')).toBe(0.5);
  });

  it('returns 0 for empty query words', () => {
    expect(wordOverlapScore([], 'anything')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// trigramSimilarityScore
// ---------------------------------------------------------------------------
describe('trigramSimilarityScore', () => {
  it('returns 1.0 for identical strings', () => {
    expect(trigramSimilarityScore('interstellar', 'interstellar')).toBe(1.0);
  });

  it('returns a high score for a typo "interstlar" vs "interstellar"', () => {
    const score = trigramSimilarityScore('interstlar', 'interstellar');
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns a low score for completely different strings', () => {
    const score = trigramSimilarityScore('interstellar', 'breaking bad');
    expect(score).toBeLessThan(0.3);
  });
});

// ---------------------------------------------------------------------------
// computeRelevanceScore
// ---------------------------------------------------------------------------
describe('computeRelevanceScore', () => {
  it('gives +100 for exact match', () => {
    const result = makeResult('Interstellar', 2014);
    const score = computeRelevanceScore(result, 'interstellar', ['interstellar'], null);
    expect(score).toBeGreaterThanOrEqual(100);
  });

  it('gives +20 year bonus for exact year match', () => {
    const result = makeResult('Interstellar', 2014);
    const withYear = computeRelevanceScore(result, 'interstellar', ['interstellar'], 2014);
    const withoutYear = computeRelevanceScore(result, 'interstellar', ['interstellar'], null);
    expect(withYear - withoutYear).toBe(20);
  });

  it('gives +10 year bonus for ±1 year', () => {
    const result = makeResult('Interstellar', 2014);
    const score = computeRelevanceScore(result, 'interstellar', ['interstellar'], 2015);
    const scoreNoYear = computeRelevanceScore(result, 'interstellar', ['interstellar'], null);
    expect(score - scoreNoYear).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// rankResults — relevance mode (issue examples)
// ---------------------------------------------------------------------------
describe('rankResults — relevance mode', () => {
  it('ranks Interstellar (2014) first for "interstellar 2014"', () => {
    const results = [
      makeResult('Primus Interstellar Drum Derby', 2025),
      makeResult('Shouting at Stars: A History of Interstellar Messages', 2025),
      makeResult('Interstellar Interference', 2023),
      makeResult('Interstellar Ella', 2022),
      makeResult('Interstellar', 2014),
    ];
    const ranked = rankResults(results, 'interstellar 2014', 'relevance');
    expect(ranked[0].title).toBe('Interstellar');
    expect(ranked[0].year).toBe(2014);
  });

  it('ranks Breaking Bad (2008) first for "breaking bad 2008"', () => {
    const results = [
      makeResult('Now, We Are Breaking Up', 2021),
      makeResult('Bradley & Barney Walsh: Breaking Dad', 2019),
      makeResult('Breaking the News', 2018),
      makeResult('Breaking Bad', 2008),
    ];
    const ranked = rankResults(results, 'breaking bad 2008', 'relevance');
    expect(ranked[0].title).toBe('Breaking Bad');
    expect(ranked[0].year).toBe(2008);
  });

  it('ranks Interstellar first even with typo "interstlar"', () => {
    const results = [
      makeResult('Interstellar Interference', 2023),
      makeResult('Interstellar Ella', 2022),
      makeResult('Interstellar', 2014),
    ];
    const ranked = rankResults(results, 'interstlar', 'relevance');
    expect(ranked[0].title).toBe('Interstellar');
  });

  it('ranks Interstellar (2014) first with wrong year ±1 ("interstellar 2015")', () => {
    const results = [
      makeResult('Interstellar Interference', 2023),
      makeResult('Interstellar', 2014),
      makeResult('Interstellar Ella', 2022),
    ];
    const ranked = rankResults(results, 'interstellar 2015', 'relevance');
    expect(ranked[0].title).toBe('Interstellar');
  });

  it('ranks Interstellar above Interstellar Interference for partial word "interst"', () => {
    const results = [
      makeResult('Interstellar Interference', 2023),
      makeResult('Interstellar', 2014),
    ];
    const ranked = rankResults(results, 'interst', 'relevance');
    expect(ranked[0].title).toBe('Interstellar');
  });
});

// ---------------------------------------------------------------------------
// rankResults — year-desc mode (existing behaviour preserved)
// ---------------------------------------------------------------------------
describe('rankResults — year-desc mode', () => {
  it('returns newest first regardless of query', () => {
    const results = [
      makeResult('Interstellar', 2014),
      makeResult('Interstellar Interference', 2023),
      makeResult('Interstellar Ella', 2022),
    ];
    const ranked = rankResults(results, 'interstellar', 'year-desc');
    expect(ranked[0].year).toBe(2023);
    expect(ranked[1].year).toBe(2022);
    expect(ranked[2].year).toBe(2014);
  });

  it('handles null years without crashing', () => {
    const results = [
      makeResult('Unknown', null),
      makeResult('Interstellar', 2014),
    ];
    expect(() => rankResults(results, 'anything', 'year-desc')).not.toThrow();
  });
});
