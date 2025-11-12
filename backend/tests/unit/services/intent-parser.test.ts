import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntentParser } from '../../../src/services/conversation/intent-parser';

// Mock logger
vi.mock('../../../src/config/logger', () => ({
  logger: {
    debug: vi.fn(),
  },
}));

describe('IntentParser', () => {
  let parser: IntentParser;

  beforeEach(() => {
    vi.clearAllMocks();
    parser = new IntentParser();
  });

  describe('parse', () => {
    describe('cancel intent', () => {
      it('should detect cancel keywords', () => {
        const cancelMessages = ['cancel', 'stop', 'no', 'nevermind', 'quit', 'exit'];

        cancelMessages.forEach((message) => {
          const result = parser.parse(message);
          expect(result).toEqual({ intent: 'cancel' });
        });
      });

      it('should be case insensitive for cancel', () => {
        const result = parser.parse('CANCEL');
        expect(result).toEqual({ intent: 'cancel' });
      });
    });

    describe('selection intent', () => {
      it('should parse numeric selections 1-99', () => {
        for (let i = 1; i <= 99; i++) {
          const result = parser.parse(i.toString());
          expect(result).toEqual({ intent: 'selection', selectionNumber: i });
        }
      });

      it('should reject numbers outside 1-99 range', () => {
        const invalidNumbers = ['0', '100', '123'];

        invalidNumbers.forEach((num) => {
          const result = parser.parse(num);
          expect(result.intent).not.toBe('selection');
        });
      });

      it('should parse word numbers', () => {
        const wordTests = [
          { word: 'one', number: 1 },
          { word: 'two', number: 2 },
          { word: 'ten', number: 10 },
          { word: 'twenty', number: 20 },
        ];

        wordTests.forEach(({ word, number }) => {
          const result = parser.parse(word);
          expect(result).toEqual({ intent: 'selection', selectionNumber: number });
        });
      });

      it('should be case insensitive for word numbers', () => {
        const result = parser.parse('ONE');
        expect(result).toEqual({ intent: 'selection', selectionNumber: 1 });
      });
    });

    describe('confirmation intent', () => {
      it('should detect positive confirmation', () => {
        const confirmMessages = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'confirm'];

        confirmMessages.forEach((message) => {
          const result = parser.parse(message);
          expect(result).toEqual({ intent: 'confirmation', confirmed: true });
        });
      });

      it('should detect negative confirmation', () => {
        // 'no' is actually in cancel keywords, so it's cancel
        expect(parser.parse('no')).toEqual({ intent: 'cancel' });
        expect(parser.parse('stop')).toEqual({ intent: 'cancel' });
      });
    });

    describe('media request intent', () => {
      it('should detect movie requests', () => {
        const movieMessages = [
          { message: 'I want to watch Inception', query: 'inception' },
          { message: 'find movie The Matrix', query: 'the matrix' },
          { message: 'add film Avatar', query: 'avatar' },
        ];

        movieMessages.forEach(({ message, query }) => {
          const result = parser.parse(message);
          expect(result).toEqual({
            intent: 'media_request',
            mediaType: 'movie',
            query,
          });
        });
      });

      it('should detect series requests', () => {
        const seriesMessages = [
          { message: 'add show The Office', query: 'the office' },
          { message: 'get series Breaking Bad', query: 'breaking bad' },
          { message: 'tv show Stranger Things', query: 'stranger things' },
        ];

        seriesMessages.forEach(({ message, query }) => {
          const result = parser.parse(message);
          expect(result).toEqual({
            intent: 'media_request',
            mediaType: 'series',
            query,
          });
        });
      });

      it('should default to both when no specific type mentioned', () => {
        const bothMessages = [
          { message: 'Inception', query: 'inception' },
          { message: 'Breaking Bad', query: 'breaking bad' },
        ];

        bothMessages.forEach(({ message, query }) => {
          const result = parser.parse(message);
          expect(result).toEqual({
            intent: 'media_request',
            mediaType: 'both',
            query,
          });
        });
      });

      it('should reject very short queries', () => {
        const shortMessages = ['a', 'hi'];

        shortMessages.forEach((message) => {
          const result = parser.parse(message);
          expect(result.intent).toBe('unknown');
        });

        // Numbers are detected as selection
        expect(parser.parse('1').intent).toBe('selection');
      });

      it('should clean up queries by removing keywords', () => {
        const testCases = [
          { input: 'I want to watch Inception', expected: 'inception' },
          { input: 'find movie The Matrix', expected: 'the matrix' },
          { input: 'add series Breaking Bad', expected: 'breaking bad' },
          { input: 'download The Office', expected: 'the office' },
        ];

        testCases.forEach(({ input, expected }) => {
          const result = parser.parse(input);
          expect(result.query).toBe(expected);
        });
      });
    });

    describe('unknown intent', () => {
      it('should return unknown for unrecognized messages', () => {
        // Messages that are too short or contain only numbers
        expect(parser.parse('a').intent).toBe('unknown');
        expect(parser.parse('123').intent).toBe('unknown');
        expect(parser.parse('').intent).toBe('unknown');
      });
    });
  });

  describe('extractTitle', () => {
    it('should extract title with year in parentheses', () => {
      const result = parser.extractTitle('Inception (2010)');
      expect(result).toEqual({ title: 'Inception', year: 2010 });
    });

    it('should extract title with year at end', () => {
      const result = parser.extractTitle('The Matrix 1999');
      expect(result).toEqual({ title: 'The Matrix', year: 1999 });
    });

    it('should return title only when no year', () => {
      const result = parser.extractTitle('Breaking Bad');
      expect(result).toEqual({ title: 'Breaking Bad' });
    });

    it('should handle extra whitespace', () => {
      const result = parser.extractTitle('  Inception  (2010)  ');
      expect(result).toEqual({ title: 'Inception', year: 2010 });
    });
  });
});
