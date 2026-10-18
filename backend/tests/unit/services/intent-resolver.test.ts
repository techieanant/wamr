import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLlmService } = vi.hoisted(() => ({
  mockLlmService: {
    isEnabled: vi.fn(),
    parseIntent: vi.fn(),
    getDisabledReason: vi.fn(() => null),
  },
}));

vi.mock('../../../src/services/llm/llm.service.js', () => ({
  llmService: mockLlmService,
  LlmService: vi.fn(),
}));

import { IntentResolver } from '../../../src/services/conversation/intent-resolver.js';
import { intentParser } from '../../../src/services/conversation/intent-parser.js';

describe('IntentResolver', () => {
  let resolver: IntentResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new IntentResolver();
  });

  describe('when the LLM is disabled', () => {
    beforeEach(() => {
      mockLlmService.isEnabled.mockReturnValue(false);
    });

    it('should use the keyword parser', async () => {
      const result = await resolver.resolve('movie Inception', 'IDLE');

      // The keyword parser lowercases and strips its own keywords
      expect(result).toEqual({
        intent: 'media_request',
        mediaType: 'movie',
        query: 'inception',
      });
      expect(mockLlmService.parseIntent).not.toHaveBeenCalled();
    });

    it('should still parse selections', async () => {
      const result = await resolver.resolve('2', 'AWAITING_SELECTION');

      expect(result).toEqual({ intent: 'selection', selectionNumber: 2 });
    });
  });

  describe('when the LLM is enabled', () => {
    beforeEach(() => {
      mockLlmService.isEnabled.mockReturnValue(true);
    });

    it('should use the LLM result and skip the keyword parser', async () => {
      const parseSpy = vi.spyOn(intentParser, 'parse');
      mockLlmService.parseIntent.mockResolvedValue({
        intent: 'media_request',
        mediaType: 'movie',
        query: 'No Country for Old Men',
      });

      const result = await resolver.resolve('no country for old men', 'IDLE');

      expect(result).toEqual({
        intent: 'media_request',
        mediaType: 'movie',
        query: 'No Country for Old Men',
      });
      expect(parseSpy).not.toHaveBeenCalled();

      parseSpy.mockRestore();
    });

    it('should pass the conversation state through to the LLM', async () => {
      mockLlmService.parseIntent.mockResolvedValue({ intent: 'cancel' });

      await resolver.resolve('stop', 'AWAITING_CONFIRMATION');

      expect(mockLlmService.parseIntent).toHaveBeenCalledWith('stop', 'AWAITING_CONFIRMATION');
    });

    it('should fall back to the keyword parser when the LLM is unavailable', async () => {
      mockLlmService.parseIntent.mockResolvedValue(null);

      const result = await resolver.resolve('1', 'AWAITING_SELECTION');

      expect(result).toEqual({ intent: 'selection', selectionNumber: 1 });
    });

    it('should fall back to the keyword parser when the LLM returns unknown', async () => {
      mockLlmService.parseIntent.mockResolvedValue({ intent: 'unknown' });

      const result = await resolver.resolve('yes', 'AWAITING_CONFIRMATION');

      expect(result).toEqual({ intent: 'confirmation', confirmed: true });
    });

    it('should return unknown when neither parser recognises the message', async () => {
      mockLlmService.parseIntent.mockResolvedValue({ intent: 'unknown' });

      const result = await resolver.resolve('?', 'IDLE');

      expect(result).toEqual({ intent: 'unknown' });
    });
  });
});
