import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Mutable env so each test can reconfigure the provider before constructing
interface MockEnv {
  LLM_ENABLED: boolean;
  LLM_PROVIDER: string;
  LLM_BASE_URL: string | undefined;
  LLM_API_KEY: string | undefined;
  LLM_MODEL: string;
  LLM_TIMEOUT_MS: number;
}

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    LLM_ENABLED: true,
    LLM_PROVIDER: 'gemini',
    LLM_BASE_URL: undefined,
    LLM_API_KEY: 'test-llm-key',
    LLM_MODEL: 'gemini-flash-latest',
    LLM_TIMEOUT_MS: 8000,
  } as MockEnv,
}));

vi.mock('../../../src/config/environment', () => ({ env: mockEnv }));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(() => false),
  },
}));

import { LlmService } from '../../../src/services/llm/llm.service.js';

/**
 * Build a provider response wrapping the given intent payload
 */
function completion(payload: unknown) {
  return {
    data: {
      choices: [{ message: { content: JSON.stringify(payload) } }],
    },
  };
}

/**
 * A fully populated model response, overridable per test
 */
function llmPayload(overrides: Record<string, unknown> = {}) {
  return {
    intent: 'unknown',
    mediaType: 'none',
    query: '',
    selectionNumber: 0,
    confirmed: false,
    allSeasons: false,
    seasons: [],
    ...overrides,
  };
}

describe('LlmService', () => {
  let mockClient: { post: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv.LLM_ENABLED = true;
    mockEnv.LLM_PROVIDER = 'gemini';
    mockEnv.LLM_BASE_URL = undefined;
    mockEnv.LLM_API_KEY = 'test-llm-key';
    mockEnv.LLM_MODEL = 'gemini-flash-latest';
    mockEnv.LLM_TIMEOUT_MS = 8000;

    mockClient = { post: vi.fn() };
    vi.mocked(axios.create).mockReturnValue(mockClient as never);
  });

  describe('configuration', () => {
    it('should be disabled when LLM_ENABLED is false', async () => {
      mockEnv.LLM_ENABLED = false;

      const service = new LlmService();

      expect(service.isEnabled()).toBe(false);
      expect(service.getDisabledReason()).toContain('LLM_ENABLED');
      expect(axios.create).not.toHaveBeenCalled();
      await expect(service.parseIntent('add Dune')).resolves.toBeNull();
    });

    it('should be disabled when a key-requiring provider has no API key', () => {
      mockEnv.LLM_API_KEY = undefined;

      const service = new LlmService();

      expect(service.isEnabled()).toBe(false);
      expect(service.getDisabledReason()).toContain('LLM_API_KEY');
    });

    it('should default to the Gemini OpenAI-compatible base URL', () => {
      new LlmService();

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
          timeout: 8000,
        })
      );
    });

    it('should prefer an explicit LLM_BASE_URL over the provider default', () => {
      mockEnv.LLM_BASE_URL = 'https://gateway.example.com/v1';

      new LlmService();

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://gateway.example.com/v1' })
      );
    });

    it('should enable ollama without an API key', () => {
      mockEnv.LLM_PROVIDER = 'ollama';
      mockEnv.LLM_API_KEY = undefined;

      const service = new LlmService();

      expect(service.isEnabled()).toBe(true);
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'http://localhost:11434/v1' })
      );
    });

    it('should be disabled for a custom provider with no base URL', () => {
      mockEnv.LLM_PROVIDER = 'custom';

      const service = new LlmService();

      expect(service.isEnabled()).toBe(false);
      expect(service.getDisabledReason()).toContain('LLM_BASE_URL');
    });
  });

  describe('request shape', () => {
    it('should request a strict JSON schema at temperature 0', async () => {
      mockClient.post.mockResolvedValue(completion(llmPayload()));

      await new LlmService().parseIntent('hello', 'IDLE');

      const [url, body] = mockClient.post.mock.calls[0];

      expect(url).toBe('/chat/completions');
      expect(body.model).toBe('gemini-flash-latest');
      expect(body.temperature).toBe(0);
      expect(body.response_format.type).toBe('json_schema');
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].content).toContain('hello');
    });

    it('should describe the conversation state to the model', async () => {
      mockClient.post.mockResolvedValue(completion(llmPayload()));

      await new LlmService().parseIntent('1', 'AWAITING_SEASON_SELECTION');

      const [, body] = mockClient.post.mock.calls[0];
      expect(body.messages[1].content).toContain('season numbers');
    });
  });

  describe('intent mapping', () => {
    it('should map a media request', async () => {
      mockClient.post.mockResolvedValue(
        completion(llmPayload({ intent: 'media_request', mediaType: 'series', query: 'Severance' }))
      );

      const result = await new LlmService().parseIntent('can you grab severance');

      expect(result).toEqual({ intent: 'media_request', mediaType: 'series', query: 'Severance' });
    });

    it('should widen mediaType "none" to "both" on a media request', async () => {
      mockClient.post.mockResolvedValue(
        completion(llmPayload({ intent: 'media_request', mediaType: 'none', query: 'Dune 2021' }))
      );

      const result = await new LlmService().parseIntent('Dune 2021');

      expect(result).toEqual({ intent: 'media_request', mediaType: 'both', query: 'Dune 2021' });
    });

    it('should reject a media request with an unusable query', async () => {
      mockClient.post.mockResolvedValue(
        completion(llmPayload({ intent: 'media_request', mediaType: 'both', query: ' a ' }))
      );

      const result = await new LlmService().parseIntent('a');

      expect(result).toEqual({ intent: 'unknown' });
    });

    it('should map a numeric selection', async () => {
      mockClient.post.mockResolvedValue(
        completion(llmPayload({ intent: 'selection', selectionNumber: 3 }))
      );

      const result = await new LlmService().parseIntent('the third one', 'AWAITING_SELECTION');

      expect(result).toEqual({ intent: 'selection', selectionNumber: 3 });
    });

    it('should reject an out-of-range selection', async () => {
      mockClient.post.mockResolvedValue(
        completion(llmPayload({ intent: 'selection', selectionNumber: 120 }))
      );

      const result = await new LlmService().parseIntent('120', 'AWAITING_SELECTION');

      expect(result).toEqual({ intent: 'unknown' });
    });

    it('should map "all seasons"', async () => {
      mockClient.post.mockResolvedValue(
        completion(llmPayload({ intent: 'season_selection', allSeasons: true, seasons: [1, 2] }))
      );

      const result = await new LlmService().parseIntent('all of them', 'AWAITING_SEASON_SELECTION');

      expect(result).toEqual({ intent: 'season_selection', seasons: 'all' });
    });

    it('should expand a season range into a sorted, deduplicated list', async () => {
      mockClient.post.mockResolvedValue(
        completion(llmPayload({ intent: 'season_selection', seasons: [3, 1, 2, 2, 0, -1] }))
      );

      const result = await new LlmService().parseIntent('seasons 1-3', 'AWAITING_SEASON_SELECTION');

      expect(result).toEqual({ intent: 'season_selection', seasons: [1, 2, 3] });
    });

    it('should reject a season selection with no valid seasons', async () => {
      mockClient.post.mockResolvedValue(
        completion(llmPayload({ intent: 'season_selection', seasons: [] }))
      );

      const result = await new LlmService().parseIntent('those ones', 'AWAITING_SEASON_SELECTION');

      expect(result).toEqual({ intent: 'unknown' });
    });

    it.each([
      [true, true],
      [false, false],
    ])('should map confirmation confirmed=%s', async (confirmed, expected) => {
      mockClient.post.mockResolvedValue(
        completion(llmPayload({ intent: 'confirmation', confirmed }))
      );

      const result = await new LlmService().parseIntent('go on', 'AWAITING_CONFIRMATION');

      expect(result).toEqual({ intent: 'confirmation', confirmed: expected });
    });

    it('should map a cancellation', async () => {
      mockClient.post.mockResolvedValue(completion(llmPayload({ intent: 'cancel' })));

      const result = await new LlmService().parseIntent('forget it');

      expect(result).toEqual({ intent: 'cancel' });
    });
  });

  describe('failure handling', () => {
    it('should return null on an empty response', async () => {
      mockClient.post.mockResolvedValue({ data: { choices: [{ message: { content: '' } }] } });

      const result = await new LlmService().parseIntent('add Dune');

      expect(result).toBeNull();
    });

    it('should return null when the response is missing choices', async () => {
      mockClient.post.mockResolvedValue({ data: {} });

      const result = await new LlmService().parseIntent('add Dune');

      expect(result).toBeNull();
    });

    it('should return null on malformed JSON', async () => {
      mockClient.post.mockResolvedValue({
        data: { choices: [{ message: { content: 'not json' } }] },
      });

      const result = await new LlmService().parseIntent('add Dune');

      expect(result).toBeNull();
    });

    it('should return null when the payload does not match the schema', async () => {
      mockClient.post.mockResolvedValue(completion({ intent: 'teleport' }));

      const result = await new LlmService().parseIntent('add Dune');

      expect(result).toBeNull();
    });

    it('should return null when the request fails', async () => {
      mockClient.post.mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await new LlmService().parseIntent('add Dune');

      expect(result).toBeNull();
    });

    it('should return null on an HTTP error from the provider', async () => {
      const axiosError = Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 429 },
        code: 'ERR_BAD_REQUEST',
      });
      mockClient.post.mockRejectedValue(axiosError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      const result = await new LlmService().parseIntent('add Dune');

      expect(result).toBeNull();
    });
  });
});
