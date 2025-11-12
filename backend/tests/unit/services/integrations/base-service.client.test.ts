import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { BaseServiceClient } from '../../../../src/services/integrations/base-service.client.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('BaseServiceClient', () => {
  let client: BaseServiceClient;
  let mockAxiosInstance: any;

  const baseURL = 'http://localhost:7878';
  const apiKey = 'test-api-key';
  const serviceName = 'TestService';

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a proper mock axios instance
    mockAxiosInstance = {
      interceptors: {
        request: {
          use: vi.fn(),
        },
        response: {
          use: vi.fn(),
        },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct configuration', () => {
      client = new BaseServiceClient(baseURL, apiKey, serviceName);

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL,
        timeout: 9000,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
        },
        httpAgent: undefined,
        httpsAgent: undefined,
      });

      expect(client).toBeDefined();
    });

    it('should set up request interceptor', () => {
      client = new BaseServiceClient(baseURL, apiKey, serviceName);

      const requestInterceptor = mockAxiosInstance.interceptors?.request?.use;
      expect(requestInterceptor).toHaveBeenCalled();

      // Test the request interceptor function
      const [successFn, errorFn] = (requestInterceptor as any).mock.calls[0];
      const mockConfig = { method: 'GET', url: '/test' };

      const result = successFn(mockConfig);
      expect(result).toBe(mockConfig);

      // Test error handling in request interceptor (should return rejected promise)
      const mockError = new Error('Request error');
      const errorResult = errorFn(mockError);
      expect(errorResult).toBeInstanceOf(Promise);
      expect(errorResult).rejects.toThrow('Request error');
    });

    it('should set up response interceptor', async () => {
      client = new BaseServiceClient(baseURL, apiKey, serviceName);

      const responseInterceptor = mockAxiosInstance.interceptors?.response?.use;
      expect(responseInterceptor).toHaveBeenCalled();

      // Test the response interceptor functions
      const [successFn, errorFn] = (responseInterceptor as any).mock.calls[0];
      const mockResponse = {
        status: 200,
        data: { success: true },
        config: { url: '/test' },
      };

      const result = successFn(mockResponse);
      expect(result).toBe(mockResponse);

      // Test error handling in response interceptor (should return rejected promise)
      const mockAxiosError = {
        response: { status: 404, data: { error: 'Not found' } },
        config: { url: '/test' },
      } as AxiosError;

      const errorResult = errorFn(mockAxiosError);
      expect(errorResult).toBeInstanceOf(Promise);
      await expect(errorResult).rejects.toBe(mockAxiosError);
    });
  });

  describe('testConnection', () => {
    beforeEach(() => {
      client = new BaseServiceClient(baseURL, apiKey, serviceName);
    });

    it('should return true when health check succeeds', async () => {
      const mockResponse = { data: { status: 'ok' } };
      mockAxiosInstance.get?.mockResolvedValue(mockResponse);

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    });

    it('should return false when health check fails', async () => {
      const mockError = new Error('Connection failed');
      mockAxiosInstance.get?.mockRejectedValue(mockError);

      const result = await client.testConnection();

      expect(result).toBe(false);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    });
  });

  describe('HTTP methods', () => {
    beforeEach(() => {
      client = new BaseServiceClient(baseURL, apiKey, serviceName);
    });

    describe('get', () => {
      it('should make GET request and return data', async () => {
        const mockResponse = { data: { items: [] } };
        mockAxiosInstance.get?.mockResolvedValue(mockResponse);

        const result = await (client as any).get('/test');

        expect(result).toEqual({ items: [] });
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', undefined);
      });

      it('should make GET request with config', async () => {
        const mockResponse = { data: { items: [] } };
        const config = { params: { limit: 10 } };
        mockAxiosInstance.get?.mockResolvedValue(mockResponse);

        const result = await (client as any).get('/test', config);

        expect(result).toEqual({ items: [] });
        expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', config);
      });
    });

    describe('post', () => {
      it('should make POST request and return data', async () => {
        const mockData = { name: 'test' };
        const mockResponse = { data: { id: 1 } };
        mockAxiosInstance.post?.mockResolvedValue(mockResponse);

        const result = await (client as any).post('/test', mockData);

        expect(result).toEqual({ id: 1 });
        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/test', mockData, undefined);
      });

      it('should make POST request with config', async () => {
        const mockData = { name: 'test' };
        const mockResponse = { data: { id: 1 } };
        const config = { headers: { 'Custom-Header': 'value' } };
        mockAxiosInstance.post?.mockResolvedValue(mockResponse);

        const result = await (client as any).post('/test', mockData, config);

        expect(result).toEqual({ id: 1 });
        expect(mockAxiosInstance.post).toHaveBeenCalledWith('/test', mockData, config);
      });
    });

    describe('put', () => {
      it('should make PUT request and return data', async () => {
        const mockData = { name: 'updated' };
        const mockResponse = { data: { success: true } };
        mockAxiosInstance.put?.mockResolvedValue(mockResponse);

        const result = await (client as any).put('/test/1', mockData);

        expect(result).toEqual({ success: true });
        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/test/1', mockData, undefined);
      });

      it('should make PUT request with config', async () => {
        const mockData = { name: 'updated' };
        const mockResponse = { data: { success: true } };
        const config = { timeout: 5000 };
        mockAxiosInstance.put?.mockResolvedValue(mockResponse);

        const result = await (client as any).put('/test/1', mockData, config);

        expect(result).toEqual({ success: true });
        expect(mockAxiosInstance.put).toHaveBeenCalledWith('/test/1', mockData, config);
      });
    });

    describe('delete', () => {
      it('should make DELETE request and return data', async () => {
        const mockResponse = { data: { deleted: true } };
        mockAxiosInstance.delete?.mockResolvedValue(mockResponse);

        const result = await (client as any).delete('/test/1');

        expect(result).toEqual({ deleted: true });
        expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/test/1', undefined);
      });

      it('should make DELETE request with config', async () => {
        const mockResponse = { data: { deleted: true } };
        const config = { params: { force: true } };
        mockAxiosInstance.delete?.mockResolvedValue(mockResponse);

        const result = await (client as any).delete('/test/1', config);

        expect(result).toEqual({ deleted: true });
        expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/test/1', config);
      });
    });
  });

  describe('createClient (static method)', () => {
    it('should create axios client with correct configuration', () => {
      const result = BaseServiceClient.createClient(baseURL, apiKey);

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL,
        timeout: 9000,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
        },
      });

      expect(result).toBeDefined();
    });
  });
});
