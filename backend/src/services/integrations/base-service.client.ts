import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { logger } from '../../config/logger';

/**
 * Base HTTP client for external API integrations
 * Provides common configuration and error handling
 */
export class BaseServiceClient {
  protected client: AxiosInstance;
  protected serviceName: string;

  constructor(baseURL: string, apiKey: string, serviceName: string) {
    this.serviceName = serviceName;

    // Create axios instance with common configuration
    this.client = axios.create({
      baseURL,
      timeout: 9000, // 9 seconds (slightly less than search timeout to allow proper error handling)
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      // Keep connections alive for better performance
      httpAgent: undefined,
      httpsAgent: undefined,
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(
          {
            service: this.serviceName,
            method: config.method,
            url: config.url,
          },
          'External API request'
        );
        return config;
      },
      (error) => {
        logger.error({ service: this.serviceName, error }, 'Request interceptor error');
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(
          {
            service: this.serviceName,
            status: response.status,
            url: response.config.url,
          },
          'External API response'
        );
        return response;
      },
      (error: AxiosError) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle API errors with consistent logging
   */
  private handleError(error: AxiosError): void {
    if (error.response) {
      // Server responded with error status
      logger.error(
        {
          service: this.serviceName,
          status: error.response.status,
          data: error.response.data,
          url: error.config?.url,
        },
        'External API error response'
      );
    } else if (error.request) {
      // Request was made but no response received
      logger.error(
        {
          service: this.serviceName,
          message: error.message,
          url: error.config?.url,
        },
        'External API no response'
      );
    } else {
      // Error setting up request
      logger.error(
        {
          service: this.serviceName,
          message: error.message,
        },
        'External API request setup error'
      );
    }
  }

  /**
   * Test connection to service
   * @returns True if connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      // Subclasses should override this with service-specific health check
      await this.client.get('/health');
      return true;
    } catch (error) {
      logger.error({ service: this.serviceName, error }, 'Connection test failed');
      return false;
    }
  }

  /**
   * Make GET request with timeout
   */
  protected async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  /**
   * Make POST request with timeout
   */
  protected async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  /**
   * Make PUT request with timeout
   */
  protected async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  /**
   * Make DELETE request with timeout
   */
  protected async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  /**
   * Create a standalone axios client for service integrations
   * This is a factory method for services that don't need to extend BaseServiceClient
   */
  static createClient(baseURL: string, apiKey: string): AxiosInstance {
    return axios.create({
      baseURL,
      timeout: 9000, // 9 seconds (slightly less than search timeout to allow proper error handling)
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
    });
  }
}
