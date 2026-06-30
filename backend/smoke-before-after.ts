/**
 * Before/after comparison: year-desc (old) vs relevance (new)
 * Run with: npx tsx smoke-before-after.ts
 */

import { rankResults, computeRelevanceScore, extractYearHint } from './src/types/media-result.types.js';
import type { NormalizedResult } from './src/types/media-result.types.js';

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';
const CYAN   = '\x1b[36m';

function makeResult(title: string, year: number | null): NormalizedResult {
  return { title, year, overview: null, posterPath: null, tmdbId: null, tvdbId: null, imdbId: null, mediaType: 'movie' };
}

function getScore(result: NormalizedResult, query: string): string {
  const { cleanQuery, yearHint } = extractYearHint(query);
  const qw = cleanQuery.split(/\s+/).filter(w => w.length > 0);
  return computeRelevanceScore(result, cleanQuery, qw, yearHint).toFixed(1);
}

function compare(label: string, query: string, results: NormalizedResult[], expectedTitle: string) {
  const before = rankResults(results, query, 'year-desc');
  const after  = rankResults(results, query, 'relevance');

  const beforePos = before.findIndex(r => r.title === expectedTitle) + 1;
  const afterPos  = after.findIndex(r => r.title === expectedTitle) + 1;
  const improved  = afterPos < beforePos;

  console.log(`\n${'─'.repeat(62)}`);
  console.log(`${BOLD}${CYAN}Query:${RESET} "${query}"  ${DIM}(looking for: ${expectedTitle})${RESET}`);
  console.log(`${'─'.repeat(62)}`);

  const maxLen = Math.max(before.length, after.length);
  const colW = 32;

  console.log(
    `  ${BOLD}${DIM}${'BEFORE (year-desc)'.padEnd(colW)}  AFTER (relevance)${RESET}`
  );
  console.log(`  ${'─'.repeat(colW)}  ${'─'.repeat(colW)}`);

  for (let i = 0; i < maxLen; i++) {
    const b = before[i];
    const a = after[i];

    const bLabel = b ? `${b.title} (${b.year})` : '';
    const aLabel = a ? `${a.title} (${a.year})` : '';
    const aScore = a ? `  ${DIM}[${getScore(a, query)}]${RESET}` : '';

    const bMark = b?.title === expectedTitle ? `${YELLOW}→ ` : '  ';
    const aMark = a?.title === expectedTitle ? (afterPos === 1 ? `${GREEN}★ ` : `${YELLOW}→ `) : '  ';

    const bColor = b?.title === expectedTitle ? YELLOW : DIM;
    const aColor = a?.title === expectedTitle ? (afterPos === 1 ? GREEN : YELLOW) : '';

    console.log(
      `${bMark}${bColor}${(i+1)+'. '+bLabel}${RESET}`.padEnd(colW + 20) +
      `  ${aMark}${aColor}${(i+1)+'. '+aLabel}${aScore}${RESET}`
    );
  }

  const verdict = improved
    ? `${GREEN}${BOLD}✓ Improved: #${beforePos} → #${afterPos}${RESET}`
    : afterPos === beforePos
      ? `${DIM}= No change (already at #${afterPos})${RESET}`
      : `${RED}✗ Regressed: #${beforePos} → #${afterPos}${RESET}`;

  console.log(`\n  Verdict: ${verdict}`);
}

// ── Test cases ───────────────────────────────────────────────────────────────

compare(
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

compare(
  'Breaking Bad 2008',
  'breaking bad 2008',
  [
    makeResult('Now, We Are Breaking Up', 2021),
    makeResult("Bradley & Barney Walsh: Breaking Dad", 2019),
    makeResult('Breaking Italy Podcast', 2019),
    makeResult('Breaking the News', 2018),
    makeResult('Breaking Bad', 2008),
  ],
  'Breaking Bad'
);

compare(
  'The Last of Us 2023',
  'the last of us 2023',
  [
    makeResult('Making of The Last of Us', 2023),
    makeResult('Chronicles of The Last of Us', 2023),
    makeResult('The Last of Us', 2023),
  ],
  'The Last of Us'
);

compare(
  'Typo: "interstlar"',
  'interstlar',
  [
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar Ella', 2022),
    makeResult('Interstellar', 2014),
  ],
  'Interstellar'
);

compare(
  'Wrong year ±1: "interstellar 2015"',
  'interstellar 2015',
  [
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar Ella', 2022),
    makeResult('Interstellar', 2014),
  ],
  'Interstellar'
);

compare(
  'Partial word: "interst"',
  'interst',
  [
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar', 2014),
  ],
  'Interstellar'
);

compare(
  'No year hint: "interstellar"',
  'interstellar',
  [
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar Ella', 2022),
    makeResult('Interstellar', 2014),
  ],
  'Interstellar'
);

compare(
  'year-desc mode preserved (separate)',
  'interstellar',
  [
    makeResult('Interstellar', 2014),
    makeResult('Interstellar Interference', 2023),
    makeResult('Interstellar Ella', 2022),
  ],
  'Interstellar Interference'
);

console.log(`\n${'═'.repeat(62)}\n`);
