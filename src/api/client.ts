import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { Config } from '../config.js';
import { getLogger } from '../utils/logger.js';
import {
  ApiError,
  AuthenticationError,
  RateLimitError,
  isRetryableError,
  getRetryDelay,
} from '../utils/errors.js';
import type { SearchResponse, LogStatsResponse } from './types.js';
import {
  buildSearchQuery,
  buildStatsQuery,
  getTimeInterval,
  transformToLogStatsResponse,
} from './queryBuilders.js';

/**
 * Logz.io API client with retry logic and error handling
 */
export class LogzioApiClient {
  private readonly axios: AxiosInstance;
  private readonly config: Config;
  private readonly logger = getLogger('LogzioApiClient');

  constructor(config: Config) {
    this.config = config;
    this.axios = this.createAxiosInstance();
  }

  private createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
      baseURL: this.config.logzioUrl || 'https://api.logz.io',
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'logzio-mcp-server/0.1.0',
        'X-API-TOKEN': this.config.apiKey,
      },
    });

    instance.interceptors.request.use(
      (config) => {
        this.logger.debug(
          { method: config.method, url: config.url },
          'Making API request'
        );
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    instance.interceptors.response.use(
      (response) => {
        this.logger.debug(
          { status: response.status, url: response.config.url },
          'Received API response'
        );
        return response;
      },
      (error) => this.handleResponseError(error)
    );

    return instance;
  }

  private handleResponseError(error: unknown): Promise<never> {
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;
      if (status === 401) {
        throw new AuthenticationError(
          'Authentication failed. This could be due to:\n' +
            '• Invalid or expired API key\n' +
            '• Wrong region - we default to US region (api.logz.io)\n' +
            "• If you're not in the US region, specify your region:\n" +
            '  - EU: add "region eu" to your command\n' +
            '  - CA: add "region ca" to your command\n' +
            '  - AU: add "region au" to your command\n' +
            '  - UK: add "region uk" to your command\n' +
            '  - US-West: add "region us-west" to your command\n' +
            '• Check your Logz.io account URL to determine your region:\n' +
            '  - app.logz.io → use "region us"\n' +
            '  - app-eu.logz.io → use "region eu"\n' +
            '  - app-ca.logz.io → use "region ca"'
        );
      }
      if (status === 429) {
        const retryAfter = this.parseRetryAfter(error.response.headers);
        throw new RateLimitError('Rate limit exceeded', retryAfter, {
          status,
          data,
        });
      }
      throw ApiError.fromResponse({ status, data });
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown API error'
    );
  }

  private parseRetryAfter(
    headers: Record<string, unknown>
  ): number | undefined {
    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    if (typeof retryAfter === 'string') {
      const seconds = parseInt(retryAfter, 10);
      return isNaN(seconds) ? undefined : seconds * 1000;
    }
    return undefined;
  }

  private async makeRequest<T>(
    config: AxiosRequestConfig,
    attempt: number = 1
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axios(config);
      return response.data;
    } catch (error) {
      if (attempt <= this.config.retryAttempts && isRetryableError(error)) {
        const delay =
          getRetryDelay(error) || this.calculateBackoffDelay(attempt);
        this.logger.warn(
          {
            attempt,
            maxAttempts: this.config.retryAttempts,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          `Request failed, retrying in ${delay}ms`
        );
        await this.sleep(delay);
        return this.makeRequest<T>(config, attempt + 1);
      }
      throw error;
    }
  }

  private calculateBackoffDelay(attempt: number): number {
    return Math.min(this.config.retryDelay * Math.pow(2, attempt - 1), 30000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async searchLogs(params: {
    query: string;
    from?: string;
    to?: string;
    size?: number;
    sort?: string;
  }): Promise<SearchResponse> {
    return this.makeRequest<SearchResponse>({
      method: 'POST',
      url: '/v1/search',
      data: buildSearchQuery(params),
    });
  }

  public async queryLogs(
    payload: Record<string, unknown>
  ): Promise<SearchResponse> {
    return this.makeRequest<SearchResponse>({
      method: 'POST',
      url: '/v1/search',
      data: payload,
    });
  }

  public async getLogStats(params: {
    from?: string;
    to?: string;
    groupBy?: string[];
  }): Promise<LogStatsResponse> {
    const queryBody = buildStatsQuery(params, getTimeInterval);
    const response = await this.makeRequest<SearchResponse>({
      method: 'POST',
      url: '/v1/search',
      data: queryBody,
    });
    return transformToLogStatsResponse(response, params);
  }

  public async healthCheck(): Promise<{
    status: string;
    timestamp: string;
  }> {
    try {
      await this.makeRequest<SearchResponse>({
        method: 'POST',
        url: '/v1/search',
        data: { query: { match_all: {} }, size: 0 },
      });
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch (error) {
      throw new Error(
        `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
