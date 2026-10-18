/**
 * Intent Resolver
 *
 * Chooses how a message gets turned into an `IntentResult`:
 * the optional LLM first, the keyword parser otherwise. The keyword parser
 * is always available, so an unconfigured, unreachable, slow or confused
 * LLM degrades to the original behaviour rather than breaking the bot.
 *
 * @module services/conversation/intent-resolver
 */

import { intentParser, IntentResult } from './intent-parser.js';
import { llmService } from '../llm/llm.service.js';
import { logger } from '../../config/logger.js';

/**
 * Intent Resolver Service
 */
export class IntentResolver {
  /**
   * Resolve the intent of a message.
   *
   * When the LLM is enabled it is tried first. If it is unavailable or
   * returns `unknown`, the keyword parser gets a chance - it is cheap, and
   * on a terse message ("1", "yes") it is at least as reliable.
   */
  async resolve(message: string, currentState?: string): Promise<IntentResult> {
    if (llmService.isEnabled()) {
      const llmIntent = await llmService.parseIntent(message, currentState);

      if (llmIntent && llmIntent.intent !== 'unknown') {
        return llmIntent;
      }

      const keywordIntent = intentParser.parse(message, currentState);

      if (llmIntent && keywordIntent.intent !== 'unknown') {
        logger.debug(
          { keywordIntent: keywordIntent.intent },
          'LLM returned unknown intent, using keyword parser result'
        );
      }

      return keywordIntent;
    }

    return intentParser.parse(message, currentState);
  }
}

// Export singleton instance
export const intentResolver = new IntentResolver();
