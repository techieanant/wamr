import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../services/api.client';
import type {
  LoginCredentials,
  AuthUser,
  LoginResponse,
  CurrentUserResponse,
} from '../types/auth.types';

/**
 * Auth store state
 */
interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  initialized: boolean;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  checkAuth: () => Promise<void>;
}

/**
 * Auth store with JWT token management
 * Uses Zustand for state management with persistence
 */
export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      initialized: false,

      /**
       * Login user
       */
      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null });

        try {
          // apiClient.post returns response.data directly (unwrapped)
          // Server returns: { success: true, data: { user, message } }
          const loginResponse = await apiClient.post<LoginResponse>('/api/auth/login', credentials);

          set({
            user: loginResponse.data.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            initialized: true,
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Login failed';
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
            initialized: true,
          });
          throw error;
        }
      },

      /**
       * Logout user
       */
      logout: async () => {
        set({ isLoading: true });

        try {
          await apiClient.post('/api/auth/logout');
        } catch (error) {
          console.error('Logout error:', error);
          // Continue with logout even if API call fails
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            initialized: false,
          });
        }
      },

      /**
       * Clear error
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * Check authentication status
       * Useful for verifying JWT on app load
       */
      checkAuth: async () => {
        const state = get();

        // Prevent multiple simultaneous calls
        if (state.isLoading) {
          return;
        }

        set({ isLoading: true });

        try {
          const currentUserResponse = await apiClient.get<CurrentUserResponse>('/api/auth/me');

          set({
            user: currentUserResponse.data.user,
            isAuthenticated: true,
            isLoading: false,
            initialized: true,
          });
        } catch (error) {
          // Token is invalid/expired - clear authentication
          console.warn('Auth check failed, clearing session:', error);
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            initialized: true,
          });
        }
      },
    }),
    {
      name: 'wamr-auth', // localStorage key
      partialize: (state) => ({
        // Persist user, isAuthenticated, and initialized to prevent re-checking on every mount
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        initialized: state.initialized,
      }),
    }
  )
);
