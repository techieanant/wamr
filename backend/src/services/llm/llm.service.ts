/**
 * LLM Service
 *
 * Optional natural-language intent extraction via any OpenAI-compatible
 * chat-completions endpoint (Google Gemini, OpenAI, Ollama, or a custom
 * gateway). Disabled by default; when disabled or unreachable the caller
 * falls back to the keyword-based parser in `intent-parser.ts`.
 *
 * The model is deliberately given a narrow job: classify the intent and
 * normalise the search query. It never picks a title, never invents
 * TMDB/TVDB ids and never drives state transitions - the existing search
 * and state machine remain the source of truth.
 *
 * @module services/llm/llm.service
 */

import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import { env } from '../../config/environment.js';
import { logger } from '../../config/logger.js';
import { IntentResult } from '../conversation/intent-parser.js';
import { MediaType } from '../../types/media-result.types.js';

/**
 * Default OpenAI-compatible base URLs per provider
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434/v1',
};

/**
 * Providers that require an API key to be configured
 */
const PROVIDERS_REQUIRING_KEY = ['gemini', 'openai'];

/**
 * Schema the model is asked to fill. Unions are avoided so that strict
 * JSON-schema modes (Gemini, OpenAI) accept it without complaint; the
 * flat shape is mapped onto `IntentResult` afterwards.
 */
const llmIntentSchema = z.object({
  intent: z.enum([
    'media_request',
    'selection',
    'confirmation',
    'cancel',
    'season_selection',
    'unknown',
  ]),
  mediaType: z.enum(['movie', 'series', 'both', 'none']),
  query: z.string(),
  selectionNumber: z.number().int(),
  confirmed: z.boolean(),
  allSeasons: z.boolean(),
  seasons: z.array(z.number().int()),
});

type LlmIntent = z.infer<typeof llmIntentSchema>;

/**
 * JSON schema sent to the provider to constrain the response
 */
const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      enum: [
        'media_request',
        'selection',
        'confirmation',
        'cancel',
        'season_selection',
        'unknown',
      ],
    },
    mediaType: { type: 'string', enum: ['movie', 'series', 'both', 'none'] },
    query: { type: 'string' },
    selectionNumber: { type: 'integer' },
    confirmed: { type: 'boolean' },
    allSeasons: { type: 'boolean' },
    seasons: { type: 'array', items: { type: 'integer' } },
  },
  required: [
    'intent',
    'mediaType',
    'query',
    'selectionNumber',
    'confirmed',
    'allSeasons',
    'seasons',
  ],
} as const;

const SYSTEM_PROMPT = `You classify WhatsApp messages sent to a self-hosted media request bot.
The bot lets approved users ask for movies and TV shows, which are forwarded to Radarr, Sonarr, Overseerr or Jellyseerr.

Classify the message into exactly one intent:
- "media_request": the user is asking for a movie or show. Set "query" to just the title, with no request words ("add", "get", "download", "can you"). Keep any year the user gave, e.g. "Dune 2021". For a vague or descriptive request ("something scary", "the new Marvel one"), put the user's own descriptive words in "query" - do NOT guess a specific title, the bot runs a real catalogue search.
- "selection": the user is picking one of the numbered results the bot just listed. Set "selectionNumber" to that number.
- "season_selection": the user is choosing TV seasons. Set "seasons" to the explicit list, expanding ranges ("1-3" becomes [1,2,3]). Set "allSeasons" true if they want every season.
- "confirmation": a yes/no answer to the bot's confirmation question. Set "confirmed" true for yes, false for no.
- "cancel": the user wants to abandon the current request ("cancel", "stop", "forget it").
- "unknown": greetings, chatter, or anything that fits none of the above.

Rules:
- A message that is only a title is a "media_request", even without request words.
- Titles may contain words that look like commands. "No Country for Old Men", "The Watch", "Stop Making Sense" and "Yes Man" are titles, not cancel/confirm intents.
- "mediaType": "movie" if clearly a film, "series" if clearly a TV show, "both" if unclear, "none" when the intent is not a media_request.
- Use the conversation state to disambiguate: a bare number is a "selection" while the bot is awaiting a selection, and a "season_selection" while it is awaiting seasons.
- Never invent a title the user did not reference.
- Always return every field. Use "" for query, 0 for selectionNumber, false for booleans and [] for seasons when they do not apply.`;

/**
 * Human-readable description of the conversation state for the model
 */
const STATE_DESCRIPTIONS: Record<string, string> = {
  IDLE: 'No active request. The user is starting fresh.',
  SEARCHING: 'A catalogue search is running.',
  AWAITING_SELECTION: 'The bot listed numbered search results and is waiting for the user to pick one.',
  AWAITING_SEASON_SELECTION:
    'The bot listed available TV seasons and is waiting for season numbers or "all".',
  AWAITING_CONFIRMATION: 'The bot asked the user to confirm the request with yes or no.',
  PROCESSING: 'The request is being submitted.',
};

/**
 * LLM Service
 * Extracts conversation intent using an OpenAI-compatible endpoint
 */
export class LlmService {
  private client: AxiosInstance | null = null;
  private disabledReason: string | null = null;

  constructor() {
    if (!env.LLM_ENABLED) {
      this.disabledReason = 'LLM_ENABLED is false';
      return;
    }

    const provider = env.LLM_PROVIDER;
    const baseURL = env.LLM_BASE_URL || PROVIDER_BASE_URLS[provider];

    if (!baseURL) {
      this.disabledReason = `LLM_BASE_URL is required for provider "${provider}"`;
      logger.error({ provider }, 'LLM disabled: no base URL configured');
      return;
    }

    if (PROVIDERS_REQUIRING_KEY.includes(provider) && !env.LLM_API_KEY) {
      this.disabledReason = `LLM_API_KEY is required for provider "${provider}"`;
      logger.error(
        { provider },
        'LLM disabled: API key missing, falling back to keyword intent parsing'
      );
      return;
    }

    this.client = axios.create({
      baseURL,
      timeout: env.LLM_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        ...(env.LLM_API_KEY ? { Authorization: `Bearer ${env.LLM_API_KEY}` } : {}),
      },
    });

    logger.info(
      { provider, model: env.LLM_MODEL, baseURL, timeoutMs: env.LLM_TIMEOUT_MS },
      'LLM intent parsing enabled'
    );
  }

  /**
   * Whether LLM intent parsing is available
   */
  isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Why the LLM is unavailable, if it is
   */
  getDisabledReason(): string | null {
    return this.disabledReason;
  }

  /**
   * Extract intent from a message.
   * Returns null when the LLM is unavailable, times out, or returns an
   * unusable response - the caller then falls back to the keyword parser.
   */
  async parseIntent(message: string, currentState?: string): Promise<IntentResult | null> {
    if (!this.client) {
      return null;
    }

    const stateDescription = currentState
      ? STATE_DESCRIPTIONS[currentState] || `Conversation state: ${currentState}`
      : STATE_DESCRIPTIONS.IDLE;

    const started = Date.now();

    try {
      const response = await this.client.post('/chat/completions', {
        model: env.LLM_MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Conversation state: ${stateDescription}\n\nMessage: ${message}`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'intent_result',
            strict: true,
            schema: RESPONSE_JSON_SCHEMA,
          },
        },
      });

      const content = response.data?.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || content.trim().length === 0) {
        logger.warn({ durationMs: Date.now() - started }, 'LLM returned an empty response');
        return null;
      }

      const parsed = llmIntentSchema.safeParse(JSON.parse(content));

      if (!parsed.success) {
        logger.warn(
          { errors: parsed.error.errors, durationMs: Date.now() - started },
          'LLM response did not match the expected intent schema'
        );
        return null;
      }

      const intent = this.toIntentResult(parsed.data);

      logger.debug(
        { intent, durationMs: Date.now() - started, model: env.LLM_MODEL },
        'LLM parsed intent'
      );

      return intent;
    } catch (error) {
      const durationMs = Date.now() - started;

      if (axios.isAxiosError(error)) {
        logger.warn(
          {
            status: error.response?.status,
            code: error.code,
            durationMs,
            model: env.LLM_MODEL,
          },
          'LLM request failed, falling back to keyword intent parsing'
        );
      } else {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error), durationMs },
          'LLM intent parsing threw, falling back to keyword intent parsing'
        );
      }

      return null;
    }
  }

  /**
   * Map the flat model output onto the internal IntentResult shape
   */
  private toIntentResult(data: LlmIntent): IntentResult {
    switch (data.intent) {
      case 'media_request': {
        const query = data.query.trim();

        // A media request without a usable query is not actionable
        if (query.length < 2) {
          return { intent: 'unknown' };
        }

        const mediaType: MediaType = data.mediaType === 'none' ? 'both' : data.mediaType;

        return { intent: 'media_request', mediaType, query };
      }

      case 'selection': {
        // Mirrors the keyword parser's accepted range (1-99)
        if (data.selectionNumber < 1 || data.selectionNumber > 99) {
          return { intent: 'unknown' };
        }

        return { intent: 'selection', selectionNumber: data.selectionNumber };
      }

      case 'season_selection': {
        if (data.allSeasons) {
          return { intent: 'season_selection', seasons: 'all' };
        }

        const seasons = [...new Set(data.seasons.filter((n) => n > 0))].sort((a, b) => a - b);

        if (seasons.length === 0) {
          return { intent: 'unknown' };
        }

        return { intent: 'season_selection', seasons };
      }

      case 'confirmation':
        return { intent: 'confirmation', confirmed: data.confirmed };

      case 'cancel':
        return { intent: 'cancel' };

      default:
        return { intent: 'unknown' };
    }
  }
}

// Export singleton instance
export const llmService = new LlmService();
