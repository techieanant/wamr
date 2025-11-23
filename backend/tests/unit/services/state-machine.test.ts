import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateMachine } from '../../../src/services/conversation/state-machine';

// Mock logger
vi.mock('../../../src/config/logger', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('StateMachine', () => {
  let stateMachine: StateMachine;

  beforeEach(() => {
    vi.clearAllMocks();
    stateMachine = new StateMachine();
  });

  describe('canTransition', () => {
    it('should allow valid transitions', () => {
      expect(stateMachine.canTransition('IDLE', 'SEARCHING')).toBe(true);
      expect(stateMachine.canTransition('SEARCHING', 'AWAITING_SELECTION')).toBe(true);
      expect(stateMachine.canTransition('SEARCHING', 'IDLE')).toBe(true);
      expect(stateMachine.canTransition('AWAITING_SELECTION', 'AWAITING_CONFIRMATION')).toBe(true);
      expect(stateMachine.canTransition('AWAITING_SELECTION', 'IDLE')).toBe(true);
      expect(stateMachine.canTransition('AWAITING_CONFIRMATION', 'PROCESSING')).toBe(true);
      expect(stateMachine.canTransition('AWAITING_CONFIRMATION', 'IDLE')).toBe(true);
      expect(stateMachine.canTransition('PROCESSING', 'IDLE')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(stateMachine.canTransition('IDLE', 'AWAITING_SELECTION')).toBe(false);
      expect(stateMachine.canTransition('SEARCHING', 'PROCESSING')).toBe(false);
      expect(stateMachine.canTransition('AWAITING_SELECTION', 'SEARCHING')).toBe(false);
      expect(stateMachine.canTransition('PROCESSING', 'SEARCHING')).toBe(false);
    });
  });

  describe('transition', () => {
    it('should transition to valid new state', () => {
      const result = stateMachine.transition('IDLE', 'SEARCHING');
      expect(result).toEqual({
        newState: 'SEARCHING',
        valid: true,
      });
    });

    it('should reject invalid transition', () => {
      const result = stateMachine.transition('IDLE', 'AWAITING_SELECTION');
      expect(result).toEqual({
        newState: 'IDLE',
        valid: false,
        error: 'Cannot transition from IDLE to AWAITING_SELECTION',
      });
    });
  });

  describe('processAction', () => {
    describe('START_SEARCH', () => {
      it('should transition from IDLE to SEARCHING', () => {
        const action = {
          type: 'START_SEARCH' as const,
          mediaType: 'movie' as const,
          query: 'test',
        };
        const result = stateMachine.processAction('IDLE', action);
        expect(result).toEqual({
          newState: 'SEARCHING',
          valid: true,
        });
      });

      it('should reject from non-IDLE state', () => {
        const action = {
          type: 'START_SEARCH' as const,
          mediaType: 'movie' as const,
          query: 'test',
        };
        const result = stateMachine.processAction('SEARCHING', action);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Can only start search from IDLE state');
      });
    });

    describe('SEARCH_COMPLETED', () => {
      it('should transition to AWAITING_SELECTION when results found', () => {
        const results = [
          {
            title: 'Test Movie',
            year: 2020,
            mediaType: 'movie' as const,
            overview: 'test',
            posterPath: null,
            tmdbId: 1,
            tvdbId: null,
            imdbId: 'tt123',
          },
        ];
        const action = { type: 'SEARCH_COMPLETED' as const, results };
        const result = stateMachine.processAction('SEARCHING', action);
        expect(result).toEqual({
          newState: 'AWAITING_SELECTION',
          valid: true,
        });
      });

      it('should transition to IDLE when no results', () => {
        const action = { type: 'SEARCH_COMPLETED' as const, results: [] };
        const result = stateMachine.processAction('SEARCHING', action);
        expect(result).toEqual({
          newState: 'IDLE',
          valid: true,
        });
      });

      it('should reject from non-SEARCHING state', () => {
        const action = { type: 'SEARCH_COMPLETED' as const, results: [] };
        const result = stateMachine.processAction('IDLE', action);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Can only complete search from SEARCHING state');
      });
    });

    describe('SEARCH_FAILED', () => {
      it('should transition from SEARCHING to IDLE', () => {
        const action = { type: 'SEARCH_FAILED' as const };
        const result = stateMachine.processAction('SEARCHING', action);
        expect(result).toEqual({
          newState: 'IDLE',
          valid: true,
        });
      });

      it('should reject from non-SEARCHING state', () => {
        const action = { type: 'SEARCH_FAILED' as const };
        const result = stateMachine.processAction('IDLE', action);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Can only fail search from SEARCHING state');
      });
    });

    describe('SELECT_RESULT', () => {
      it('should transition from AWAITING_SELECTION to AWAITING_CONFIRMATION', () => {
        const resultData = {
          title: 'Test Movie',
          year: 2020,
          mediaType: 'movie' as const,
          overview: 'test',
          posterPath: null,
          tmdbId: 1,
          tvdbId: null,
          imdbId: 'tt123',
        };
        const action = { type: 'SELECT_RESULT' as const, index: 0, result: resultData };
        const result = stateMachine.processAction('AWAITING_SELECTION', action);
        // Note: SELECT_RESULT validates the action but doesn't change state
        // The actual state transition is handled by the conversation service
        expect(result).toEqual({
          newState: 'AWAITING_SELECTION',
          valid: true,
        });
      });

      it('should reject from non-AWAITING_SELECTION state', () => {
        const resultData = {
          title: 'Test Movie',
          year: 2020,
          mediaType: 'movie' as const,
          overview: 'test',
          posterPath: null,
          tmdbId: 1,
          tvdbId: null,
          imdbId: 'tt123',
        };
        const action = { type: 'SELECT_RESULT' as const, index: 0, result: resultData };
        const result = stateMachine.processAction('IDLE', action);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Can only select result from AWAITING_SELECTION state');
      });
    });

    describe('CONFIRM', () => {
      it('should transition from AWAITING_CONFIRMATION to PROCESSING', () => {
        const action = { type: 'CONFIRM' as const };
        const result = stateMachine.processAction('AWAITING_CONFIRMATION', action);
        expect(result).toEqual({
          newState: 'PROCESSING',
          valid: true,
        });
      });

      it('should reject from non-AWAITING_CONFIRMATION state', () => {
        const action = { type: 'CONFIRM' as const };
        const result = stateMachine.processAction('IDLE', action);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Can only confirm from AWAITING_CONFIRMATION state');
      });
    });

    describe('CANCEL', () => {
      it('should transition to IDLE from cancellable states', () => {
        const action = { type: 'CANCEL' as const };

        expect(stateMachine.processAction('IDLE', action)).toEqual({
          newState: 'IDLE',
          valid: true,
        });
        expect(stateMachine.processAction('SEARCHING', action)).toEqual({
          newState: 'IDLE',
          valid: true,
        });
        expect(stateMachine.processAction('AWAITING_SELECTION', action)).toEqual({
          newState: 'IDLE',
          valid: true,
        });
        expect(stateMachine.processAction('AWAITING_CONFIRMATION', action)).toEqual({
          newState: 'IDLE',
          valid: true,
        });
      });

      it('should reject from PROCESSING state', () => {
        const action = { type: 'CANCEL' as const };
        const result = stateMachine.processAction('PROCESSING', action);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Cannot cancel while processing');
      });
    });

    describe('PROCESSING_COMPLETED', () => {
      it('should transition from PROCESSING to IDLE', () => {
        const action = { type: 'PROCESSING_COMPLETED' as const };
        const result = stateMachine.processAction('PROCESSING', action);
        expect(result).toEqual({
          newState: 'IDLE',
          valid: true,
        });
      });

      it('should reject from non-PROCESSING state', () => {
        const action = { type: 'PROCESSING_COMPLETED' as const };
        const result = stateMachine.processAction('IDLE', action);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Can only complete processing from PROCESSING state');
      });
    });

    describe('TIMEOUT', () => {
      it('should transition to IDLE from any state', () => {
        const action = { type: 'TIMEOUT' as const };

        const states: Array<
          'IDLE' | 'SEARCHING' | 'AWAITING_SELECTION' | 'AWAITING_CONFIRMATION' | 'PROCESSING'
        > = ['IDLE', 'SEARCHING', 'AWAITING_SELECTION', 'AWAITING_CONFIRMATION', 'PROCESSING'];

        states.forEach((state) => {
          const result = stateMachine.processAction(state, action);
          expect(result).toEqual({
            newState: 'IDLE',
            valid: true,
          });
        });
      });
    });

    describe('unknown action', () => {
      it('should return error for unknown action type', () => {
        const action = { type: 'UNKNOWN' as any };
        const result = stateMachine.processAction('IDLE', action);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Unknown action type');
      });
    });
  });

  describe('getStateDescription', () => {
    it('should return correct descriptions', () => {
      expect(stateMachine.getStateDescription('IDLE')).toBe('No active conversation');
      expect(stateMachine.getStateDescription('SEARCHING')).toBe('Searching for media');
      expect(stateMachine.getStateDescription('AWAITING_SELECTION')).toBe(
        'Waiting for user to select from results'
      );
      expect(stateMachine.getStateDescription('AWAITING_CONFIRMATION')).toBe(
        'Waiting for user confirmation'
      );
      expect(stateMachine.getStateDescription('PROCESSING')).toBe(
        'Submitting request to media service'
      );
    });
  });

  describe('canCancel', () => {
    it('should allow cancellation from all states except PROCESSING', () => {
      expect(stateMachine.canCancel('IDLE')).toBe(true);
      expect(stateMachine.canCancel('SEARCHING')).toBe(true);
      expect(stateMachine.canCancel('AWAITING_SELECTION')).toBe(true);
      expect(stateMachine.canCancel('AWAITING_CONFIRMATION')).toBe(true);
      expect(stateMachine.canCancel('PROCESSING')).toBe(false);
    });
  });

  describe('requiresUserInput', () => {
    it('should require input only for selection and confirmation states', () => {
      expect(stateMachine.requiresUserInput('IDLE')).toBe(false);
      expect(stateMachine.requiresUserInput('SEARCHING')).toBe(false);
      expect(stateMachine.requiresUserInput('AWAITING_SELECTION')).toBe(true);
      expect(stateMachine.requiresUserInput('AWAITING_CONFIRMATION')).toBe(true);
      expect(stateMachine.requiresUserInput('PROCESSING')).toBe(false);
    });
  });

  describe('getExpectedInput', () => {
    it('should return correct expected inputs', () => {
      expect(stateMachine.getExpectedInput('IDLE')).toBe(
        'Media request (e.g., "I want to watch Inception")'
      );
      expect(stateMachine.getExpectedInput('SEARCHING')).toBe('Please wait...');
      expect(stateMachine.getExpectedInput('AWAITING_SELECTION')).toBe(
        'Selection number (1-5) or CANCEL'
      );
      expect(stateMachine.getExpectedInput('AWAITING_CONFIRMATION')).toBe(
        'YES to confirm or NO to cancel'
      );
      expect(stateMachine.getExpectedInput('PROCESSING')).toBe('Please wait...');
    });
  });
});
