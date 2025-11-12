import {
  ConversationState,
  MediaType,
  NormalizedResult,
} from '../../models/conversation-session.model.js';
import { logger } from '../../config/logger.js';

/**
 * State transition rules for the conversation state machine
 */
const STATE_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  IDLE: ['SEARCHING', 'IDLE'], // Allow self-transition for cancel/timeout
  SEARCHING: ['AWAITING_SELECTION', 'IDLE'], // IDLE for no results
  AWAITING_SELECTION: ['AWAITING_CONFIRMATION', 'IDLE'], // IDLE for cancel
  AWAITING_CONFIRMATION: ['PROCESSING', 'IDLE'], // IDLE for cancel
  PROCESSING: ['IDLE'],
};

/**
 * State machine action types
 */
export type StateMachineAction =
  | { type: 'START_SEARCH'; mediaType: MediaType; query: string }
  | { type: 'SEARCH_COMPLETED'; results: NormalizedResult[] }
  | { type: 'SEARCH_FAILED' }
  | { type: 'SELECT_RESULT'; index: number; result: NormalizedResult }
  | { type: 'CONFIRM' }
  | { type: 'REJECT' }
  | { type: 'PROCESSING_COMPLETED' }
  | { type: 'PROCESSING_FAILED' }
  | { type: 'CANCEL' }
  | { type: 'TIMEOUT' };

/**
 * State machine transition result
 */
export interface StateTransitionResult {
  newState: ConversationState;
  valid: boolean;
  error?: string;
}

/**
 * Conversation State Machine
 * Manages state transitions for the conversation flow
 */
export class StateMachine {
  /**
   * Validate if a transition is allowed
   */
  canTransition(currentState: ConversationState, newState: ConversationState): boolean {
    const allowedTransitions = STATE_TRANSITIONS[currentState];
    return allowedTransitions.includes(newState);
  }

  /**
   * Transition to a new state
   */
  transition(currentState: ConversationState, newState: ConversationState): StateTransitionResult {
    if (!this.canTransition(currentState, newState)) {
      logger.warn({ currentState, newState }, 'Invalid state transition attempted');
      return {
        newState: currentState,
        valid: false,
        error: `Cannot transition from ${currentState} to ${newState}`,
      };
    }

    logger.debug({ currentState, newState }, 'State transition');

    return {
      newState,
      valid: true,
    };
  }

  /**
   * Process an action and determine the next state
   */
  processAction(
    currentState: ConversationState,
    action: StateMachineAction
  ): StateTransitionResult {
    switch (action.type) {
      case 'START_SEARCH':
        return this.handleStartSearch(currentState);

      case 'SEARCH_COMPLETED':
        return this.handleSearchCompleted(currentState, action.results);

      case 'SEARCH_FAILED':
        return this.handleSearchFailed(currentState);

      case 'SELECT_RESULT':
        return this.handleSelectResult(currentState);

      case 'CONFIRM':
        return this.handleConfirm(currentState);

      case 'REJECT':
      case 'CANCEL':
        return this.handleCancel(currentState);

      case 'PROCESSING_COMPLETED':
      case 'PROCESSING_FAILED':
        return this.handleProcessingComplete(currentState);

      case 'TIMEOUT':
        return this.handleTimeout(currentState);

      default:
        logger.warn({ currentState, action }, 'Unknown action type');
        return {
          newState: currentState,
          valid: false,
          error: 'Unknown action type',
        };
    }
  }

  /**
   * Handle START_SEARCH action
   * IDLE → SEARCHING
   */
  private handleStartSearch(currentState: ConversationState): StateTransitionResult {
    if (currentState !== 'IDLE') {
      return {
        newState: currentState,
        valid: false,
        error: 'Can only start search from IDLE state',
      };
    }

    return this.transition(currentState, 'SEARCHING');
  }

  /**
   * Handle SEARCH_COMPLETED action
   * SEARCHING → AWAITING_SELECTION (if results found)
   * SEARCHING → IDLE (if no results)
   */
  private handleSearchCompleted(
    currentState: ConversationState,
    results: NormalizedResult[]
  ): StateTransitionResult {
    if (currentState !== 'SEARCHING') {
      return {
        newState: currentState,
        valid: false,
        error: 'Can only complete search from SEARCHING state',
      };
    }

    // If no results, go back to IDLE
    if (results.length === 0) {
      return this.transition(currentState, 'IDLE');
    }

    // If results found, wait for user selection
    return this.transition(currentState, 'AWAITING_SELECTION');
  }

  /**
   * Handle SEARCH_FAILED action
   * SEARCHING → IDLE
   */
  private handleSearchFailed(currentState: ConversationState): StateTransitionResult {
    if (currentState !== 'SEARCHING') {
      return {
        newState: currentState,
        valid: false,
        error: 'Can only fail search from SEARCHING state',
      };
    }

    return this.transition(currentState, 'IDLE');
  }

  /**
   * Handle SELECT_RESULT action
   * AWAITING_SELECTION → AWAITING_CONFIRMATION
   */
  private handleSelectResult(currentState: ConversationState): StateTransitionResult {
    if (currentState !== 'AWAITING_SELECTION') {
      return {
        newState: currentState,
        valid: false,
        error: 'Can only select result from AWAITING_SELECTION state',
      };
    }

    return this.transition(currentState, 'AWAITING_CONFIRMATION');
  }

  /**
   * Handle CONFIRM action
   * AWAITING_CONFIRMATION → PROCESSING
   */
  private handleConfirm(currentState: ConversationState): StateTransitionResult {
    if (currentState !== 'AWAITING_CONFIRMATION') {
      return {
        newState: currentState,
        valid: false,
        error: 'Can only confirm from AWAITING_CONFIRMATION state',
      };
    }

    return this.transition(currentState, 'PROCESSING');
  }

  /**
   * Handle CANCEL/REJECT action
   * Any state → IDLE (except PROCESSING)
   */
  private handleCancel(currentState: ConversationState): StateTransitionResult {
    if (currentState === 'PROCESSING') {
      return {
        newState: currentState,
        valid: false,
        error: 'Cannot cancel while processing',
      };
    }

    return this.transition(currentState, 'IDLE');
  }

  /**
   * Handle PROCESSING_COMPLETED/FAILED action
   * PROCESSING → IDLE
   */
  private handleProcessingComplete(currentState: ConversationState): StateTransitionResult {
    if (currentState !== 'PROCESSING') {
      return {
        newState: currentState,
        valid: false,
        error: 'Can only complete processing from PROCESSING state',
      };
    }

    return this.transition(currentState, 'IDLE');
  }

  /**
   * Handle TIMEOUT action
   * Any state → IDLE
   */
  private handleTimeout(currentState: ConversationState): StateTransitionResult {
    return this.transition(currentState, 'IDLE');
  }

  /**
   * Get human-readable state description
   */
  getStateDescription(state: ConversationState): string {
    const descriptions: Record<ConversationState, string> = {
      IDLE: 'No active conversation',
      SEARCHING: 'Searching for media',
      AWAITING_SELECTION: 'Waiting for user to select from results',
      AWAITING_CONFIRMATION: 'Waiting for user confirmation',
      PROCESSING: 'Submitting request to media service',
    };

    return descriptions[state];
  }

  /**
   * Check if state allows user cancellation
   */
  canCancel(state: ConversationState): boolean {
    return state !== 'PROCESSING';
  }

  /**
   * Check if state requires user input
   */
  requiresUserInput(state: ConversationState): boolean {
    return state === 'AWAITING_SELECTION' || state === 'AWAITING_CONFIRMATION';
  }

  /**
   * Get expected user input for current state
   */
  getExpectedInput(state: ConversationState): string {
    const expectedInputs: Record<ConversationState, string> = {
      IDLE: 'Media request (e.g., "I want to watch Inception")',
      SEARCHING: 'Please wait...',
      AWAITING_SELECTION: 'Selection number (1-5) or CANCEL',
      AWAITING_CONFIRMATION: 'YES to confirm or NO to cancel',
      PROCESSING: 'Please wait...',
    };

    return expectedInputs[state];
  }
}

// Export singleton instance
export const stateMachine = new StateMachine();
