import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * API error response structure
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * API client with JWT interceptor
 */
class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Include cookies (JWT)
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Log request in development only
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      (error: AxiosError<ApiError>) => {
        // Handle common errors
        if (error.response) {
          const { status, data } = error.response;

          // Unauthorized - don't redirect here, let the auth hook handle it
          if (status === 401 && import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug('Unauthorized - invalid or expired session');
            // Don't redirect here - the useAuth hook and route guards will handle navigation
          }

          // Rate limited
          if (status === 429) {
            const retryAfter = error.response.headers['retry-after'];
            console.warn(`Rate limited. Retry after ${retryAfter} seconds`);
          }

          // Return structured error
          return Promise.reject({
            code: data?.code || 'UNKNOWN_ERROR',
            message: data?.message || 'An unexpected error occurred',
            details: data?.details,
          } as ApiError);
        }

        // Network error
        if (error.request) {
          console.error('Network error:', error.message);
          return Promise.reject({
            code: 'NETWORK_ERROR',
            message: 'Unable to connect to server. Please check your connection.',
          } as ApiError);
        }

        // Other errors
        return Promise.reject({
          code: 'UNKNOWN_ERROR',
          message: error.message || 'An unexpected error occurred',
        } as ApiError);
      }
    );
  }

  /**
   * GET request
   */
  async get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  }

  /**
   * POST request
   */
  async post<T = unknown>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  /**
   * PUT request
   */
  async put<T = unknown>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.put<T>(url, data);
    return response.data;
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(url: string, data?: unknown): Promise<T> {
    const response = await this.client.patch<T>(url, data);
    return response.data;
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url);
    return response.data;
  }

  /**
   * Get underlying axios instance for advanced usage
   */
  getInstance(): AxiosInstance {
    return this.client;
  }
}

// Singleton instance
export const apiClient = new ApiClient();
