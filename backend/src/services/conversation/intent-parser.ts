import { MediaType } from '../../types/media-result.types.js';
import { logger } from '../../config/logger.js';

/**
 * Intent detection result
 */
export interface IntentResult {
  intent:
    | 'media_request'
    | 'selection'
    | 'confirmation'
    | 'cancel'
    | 'season_selection'
    | 'unknown';
  mediaType?: MediaType;
  query?: string;
  selectionNumber?: number;
  confirmed?: boolean;
  seasons?: 'all' | number[];
}

/**
 * Keywords for detecting movie requests
 */
const MOVIE_KEYWORDS = [
  'movie',
  'film',
  'watch',
  'find',
  'search',
  'looking for',
  'want to see',
  'want to watch',
  'add movie',
  'get movie',
  'download movie',
];

/**
 * Keywords for detecting TV series requests
 */
const SERIES_KEYWORDS = [
  'series',
  'show',
  'tv',
  'tv show',
  'television',
  'episode',
  'season',
  'add series',
  'add show',
  'get series',
  'get show',
  'download series',
  'download show',
];

/**
 * Keywords for detecting cancellation
 */
const CANCEL_KEYWORDS = ['cancel', 'stop', 'no', 'nevermind', 'never mind', 'quit', 'exit'];

/**
 * Keywords for detecting confirmation
 */
const CONFIRM_KEYWORDS = [
  'yes',
  'yeah',
  'yep',
  'sure',
  'ok',
  'okay',
  'confirm',
  'correct',
  'right',
  'yup',
];

/**
 * Intent Parser Service
 * Analyzes WhatsApp messages to determine user intent and extract relevant information
 */
export class IntentParser {
  /**
   * Parse a message and determine the user's intent
   */
  parse(message: string, currentState?: string): IntentResult {
    const normalizedMessage = message.toLowerCase().trim();

    // Check for cancellation intent (highest priority)
    if (this.isCancelIntent(normalizedMessage)) {
      logger.debug({ message }, 'Detected cancel intent');
      return { intent: 'cancel' };
    }

    // Check for season selection if in AWAITING_SEASON_SELECTION state
    if (currentState === 'AWAITING_SEASON_SELECTION') {
      const seasonSelection = this.parseSeasonSelection(normalizedMessage);
      if (seasonSelection !== null) {
        logger.debug({ message, seasons: seasonSelection }, 'Detected season selection intent');
        return { intent: 'season_selection', seasons: seasonSelection };
      }
    }

    // Check for numeric selection (e.g., "1", "2", etc.)
    const selectionNumber = this.parseSelection(normalizedMessage);
    if (selectionNumber !== null) {
      logger.debug({ message, selectionNumber }, 'Detected selection intent');
      return { intent: 'selection', selectionNumber };
    }

    // Check for confirmation intent
    if (this.isConfirmationIntent(normalizedMessage)) {
      const confirmed = this.isConfirmed(normalizedMessage);
      logger.debug({ message, confirmed }, 'Detected confirmation intent');
      return { intent: 'confirmation', confirmed };
    }

    // Check for media request intent
    const mediaRequest = this.parseMediaRequest(normalizedMessage);
    if (mediaRequest) {
      logger.debug(
        { message, mediaType: mediaRequest.mediaType, query: mediaRequest.query },
        'Detected media request intent'
      );
      return {
        intent: 'media_request',
        mediaType: mediaRequest.mediaType,
        query: mediaRequest.query,
      };
    }

    // Unknown intent
    logger.debug({ message }, 'Unknown intent');
    return { intent: 'unknown' };
  }

  /**
   * Check if message is a cancellation request
   */
  private isCancelIntent(message: string): boolean {
    return CANCEL_KEYWORDS.some((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(message);
    });
  }

  /**
   * Check if message is a confirmation response
   */
  private isConfirmationIntent(message: string): boolean {
    // Check if message contains yes/no keywords
    const hasConfirmKeyword = CONFIRM_KEYWORDS.some((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(message);
    });

    const hasCancelKeyword = CANCEL_KEYWORDS.some((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(message);
    });

    return hasConfirmKeyword || hasCancelKeyword;
  }

  /**
   * Determine if confirmation is affirmative or negative
   */
  private isConfirmed(message: string): boolean {
    const hasConfirmKeyword = CONFIRM_KEYWORDS.some((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(message);
    });

    return hasConfirmKeyword;
  }

  /**
   * Parse numeric selection from message (1-99 to match maxResults limit)
   */
  private parseSelection(message: string): number | null {
    // Check for 1-2 digit numbers (1-99)
    const match = message.match(/^\s*(\d{1,2})\s*$/);
    if (match) {
      const num = parseInt(match[1], 10);
      // Accept 1-99 to match the maxResults configuration limit
      if (num >= 1 && num <= 99) {
        return num;
      }
    }

    // Check for word form (one through twenty)
    const wordNumbers: Record<string, number> = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
    };

    for (const [word, number] of Object.entries(wordNumbers)) {
      const regex = new RegExp(`^\\s*${word}\\s*$`, 'i');
      if (regex.test(message)) {
        return number;
      }
    }

    return null;
  }

  /**
   * Parse media request and extract media type and query
   */
  private parseMediaRequest(message: string): { mediaType: MediaType; query: string } | null {
    // Check for movie keywords
    const hasMovieKeyword = MOVIE_KEYWORDS.some((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(message);
    });

    // Check for series keywords
    const hasSeriesKeyword = SERIES_KEYWORDS.some((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(message);
    });

    // Determine media type based on keywords
    let mediaType: MediaType | null = null;
    if (hasSeriesKeyword && !hasMovieKeyword) {
      mediaType = 'series';
    } else if (hasMovieKeyword && !hasSeriesKeyword) {
      mediaType = 'movie';
    } else {
      // If both keywords present, or no keywords (implicit request like "Inception", "Breaking Bad")
      // Search both movies AND series - let the user pick from results
      if (message.length > 2 && !this.containsOnlyNumbers(message)) {
        mediaType = 'both'; // Search both types for better UX
      }
    }

    if (!mediaType) {
      return null;
    }

    // Extract query by removing common prefixes/keywords
    let query = message;

    // Remove common request phrases
    const phrasesToRemove = [
      'i want to watch',
      'i want to see',
      'i want',
      'looking for',
      'search for',
      'find',
      'add',
      'get',
      'download',
      'watch',
      'see',
      ...MOVIE_KEYWORDS,
      ...SERIES_KEYWORDS,
    ];

    for (const phrase of phrasesToRemove) {
      const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
      query = query.replace(regex, '');
    }

    // Clean up the query
    query = query
      .trim()
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/^[^\w]+|[^\w]+$/g, ''); // Remove leading/trailing non-word characters

    // If query is too short or empty, it's not a valid request
    if (query.length < 2) {
      return null;
    }

    return { mediaType, query };
  }

  /**
   * Parse season selection from message
   * Accepts: "all", "1", "1,2,3", "1, 2, 3"
   */
  private parseSeasonSelection(message: string): 'all' | number[] | null {
    // Check for "all" keyword
    if (/^\s*all\s*$/i.test(message)) {
      return 'all';
    }

    // Check for comma-separated numbers: "1,2,3" or "1, 2, 3"
    const commaMatch = message.match(/^\s*(\d+\s*(?:,\s*\d+\s*)*)\s*$/);
    if (commaMatch) {
      const seasons = commaMatch[1]
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      if (seasons.length > 0) {
        // Remove duplicates and sort
        return [...new Set(seasons)].sort((a, b) => a - b);
      }
    }

    // Check for single number
    const singleMatch = message.match(/^\s*(\d+)\s*$/);
    if (singleMatch) {
      const season = parseInt(singleMatch[1], 10);
      if (season > 0) {
        return [season];
      }
    }

    return null;
  }

  /**
   * Check if string contains only numbers
   */
  private containsOnlyNumbers(str: string): boolean {
    return /^\d+$/.test(str.trim());
  }

  /**
   * Extract media title from various formats
   * Handles: "Movie Name", "Movie Name (2020)", "Movie Name 2020", etc.
   */
  extractTitle(query: string): { title: string; year?: number } {
    // Try to extract year in parentheses: "Movie Name (2020)"
    const yearInParensMatch = query.match(/^(.+?)\s*\((\d{4})\)\s*$/);
    if (yearInParensMatch) {
      return {
        title: yearInParensMatch[1].trim(),
        year: parseInt(yearInParensMatch[2], 10),
      };
    }

    // Try to extract year at end: "Movie Name 2020"
    const yearAtEndMatch = query.match(/^(.+?)\s+(\d{4})\s*$/);
    if (yearAtEndMatch) {
      return {
        title: yearAtEndMatch[1].trim(),
        year: parseInt(yearAtEndMatch[2], 10),
      };
    }

    // No year found, return full query as title
    return { title: query.trim() };
  }
}

// Export singleton instance
export const intentParser = new IntentParser();
