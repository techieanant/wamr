/**
 * Smoke test: ranking logic against the exact examples from issue #55
 * Run with: npx tsx smoke-ranking.ts
 */

import {
  rankResults,
  computeRelevanceScore,
  extractYearHint,
} from './src/types/media-result.types.js';
import type { NormalizedResult } from './src/types/media-result.types.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function makeResult(title: string, year: number | null): NormalizedResult {
  return { title, year, overview: null, posterPath: null, tmdbId: null, tvdbId: null, imdbId: null, mediaType: 'movie' };
}

let passed = 0;
let failed = 0;

function check(label: string, query: string, results: NormalizedResult[], expectedFirst: string) {
  const ranked = rankResults(results, query, 'relevance');

  // Print scores for transparency
  const { cleanQuery, yearHint } = extractYearHint(query);
  const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 0);
  const withScores = ranked.map(r => ({
    title: r.title,
    year: r.year,
    score: computeRelevanceScore(r, cleanQuery, queryWords, yearHint).toFixed(1),
  }));

  const ok = ranked[0]?.title === expectedFirst;
  const icon = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  console.log(`\n${icon} ${BOLD}${label}${RESET}  (query: "${query}")`);
  withScores.forEach((r, i) => {
    const marker = i === 0 ? (ok ? GREEN : RED) : '';
    console.log(`  ${marker}${i + 1}. ${r.title} (${r.year})  [score: ${r.score}]${RESET}`);
  });
  if (!ok) {
    console.log(`  ${RED}Expected #1: ${expectedFirst}${RESET}`);
    failed++;
  } else {
    passed++;
  }
}

// ── Issue examples ──────────────────────────────────────────────────────────

check(
  'Interstellar 2014',
  'interstellar 2014',
  [
    makeResult('Primus Interstellar Drum Derby', 2025),
    makeResult('Shouting at Stars: A History of Interstellar Messages', 2025),
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar Ella', 2022),
    makeResult('Interstellar', 2014),
  ],
  'Interstellar'
);

check(
  'Breaking Bad 2008',
  'breaking bad 2008',
  [
    makeResult('Now, We Are Breaking Up', 2021),
    makeResult("Bradley & Barney Walsh: Breaking Dad", 2019),
    makeResult('Breaking the News', 2018),
    makeResult('Breaking Italy Podcast', 2019),
    makeResult('Breaking Bad', 2008),
  ],
  'Breaking Bad'
);

check(
  'The Last of Us 2023',
  'the last of us 2023',
  [
    makeResult('Making of The Last of Us', 2023),
    makeResult('Chronicles of The Last of Us', 2023),
    makeResult('The Last of Us', 2023),
  ],
  'The Last of Us'
);

// ── Fuzzy / edge cases ──────────────────────────────────────────────────────

check(
  'Typo: interstlar',
  'interstlar',
  [
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar Ella', 2022),
    makeResult('Interstellar', 2014),
  ],
  'Interstellar'
);

check(
  'Wrong year ±1: interstellar 2015',
  'interstellar 2015',
  [
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar Ella', 2022),
    makeResult('Interstellar', 2014),
  ],
  'Interstellar'
);

check(
  'Partial word: interst',
  'interst',
  [
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar', 2014),
  ],
  'Interstellar'
);

// year-desc mode is tested separately below — skip relevance version here
// (The check() helper always uses relevance mode; year-desc verified below)

// Re-run last one with year-desc to actually verify it
{
  const results = [
    makeResult('Interstellar', 2014),
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar Ella', 2022),
  ];
  const ranked = rankResults(results, 'interstellar', 'year-desc');
  const ok = ranked[0].year === 2023;
  const icon = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  console.log(`\n${icon} ${BOLD}year-desc mode${RESET}  (query: "interstellar")`);
  ranked.forEach((r, i) => {
    const marker = i === 0 ? (ok ? GREEN : RED) : '';
    console.log(`  ${marker}${i + 1}. ${r.title} (${r.year})${RESET}`);
  });
  if (ok) passed++; else failed++;
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`${GREEN}${BOLD}All ${passed} checks passed ✓${RESET}`);
} else {
  console.log(`${RED}${BOLD}${failed} failed, ${passed} passed${RESET}`);
}
console.log('');

process.exit(failed > 0 ? 1 : 0);
