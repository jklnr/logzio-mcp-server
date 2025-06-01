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
import type {
  SearchResponse,
  LogStatsResponse,
  ApiResponse,
} from './types.js';

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

  /**
   * Create configured axios instance
   */
  private createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
      baseURL: this.config.logzioUrl || 'https://api.logz.io',
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'mcp-server-logzio/0.1.0',
        'X-API-TOKEN': this.config.apiKey,
      },
    });

    // Request interceptor for logging
    instance.interceptors.request.use(
      (config) => {
        this.logger.debug('Making API request', {
          method: config.method,
          url: config.url,
        });
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    instance.interceptors.response.use(
      (response) => {
        this.logger.debug('Received API response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        return this.handleResponseError(error);
      }
    );

    return instance;
  }

  /**
   * Handle response errors and convert to custom error types
   */
  private handleResponseError(error: unknown): Promise<never> {
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          throw new AuthenticationError(
            'Authentication failed. This could be due to:\n' +
            '• Invalid or expired API key\n' +
            '• Wrong region - we default to US region (api.logz.io)\n' +
            '• If you\'re not in the US region, specify your region:\n' +
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
        case 429:
          const retryAfter = this.parseRetryAfter(error.response.headers);
          throw new RateLimitError(
            'Rate limit exceeded',
            retryAfter,
            { status, data }
          );
        default:
          throw ApiError.fromResponse({ status, data });
      }
    }
    
    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown API error'
    );
  }

  /**
   * Parse retry-after header
   */
  private parseRetryAfter(headers: Record<string, unknown>): number | undefined {
    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    if (typeof retryAfter === 'string') {
      const seconds = parseInt(retryAfter, 10);
      return isNaN(seconds) ? undefined : seconds * 1000;
    }
    return undefined;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest<T>(
    config: AxiosRequestConfig,
    attempt: number = 1
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axios(config);
      return response.data;
    } catch (error) {
      if (attempt <= this.config.retryAttempts && isRetryableError(error)) {
        const delay = getRetryDelay(error) || this.calculateBackoffDelay(attempt);
        
        this.logger.warn(`Request failed, retrying in ${delay}ms`, {
          attempt,
          maxAttempts: this.config.retryAttempts,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        await this.sleep(delay);
        return this.makeRequest<T>(config, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attempt: number): number {
    return Math.min(
      this.config.retryDelay * Math.pow(2, attempt - 1),
      30000 // Max 30 seconds
    );
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Search logs using simple query
   */
  public async searchLogs(params: {
    query: string;
    from?: string;
    to?: string;
    size?: number;
    sort?: string;
  }): Promise<SearchResponse> {
    // Build Elasticsearch query body for Logz.io API
    const queryBody: any = {
      query: {
        query_string: {
          query: params.query
        }
      },
      size: params.size || 50,
    };

    // Add time range filter if specified
    if (params.from || params.to) {
      queryBody.query = {
        bool: {
          must: [queryBody.query],
          filter: {
            range: {
              '@timestamp': {
                ...(params.from && { gte: params.from }),
                ...(params.to && { lte: params.to })
              }
            }
          }
        }
      };
    }

    // Add sorting
    if (params.sort) {
      if (params.sort.includes('desc')) {
        queryBody.sort = [{ '@timestamp': { order: 'desc' } }];
      } else {
        queryBody.sort = [{ '@timestamp': { order: 'asc' } }];
      }
    } else {
      queryBody.sort = [{ '@timestamp': { order: 'desc' } }];
    }

    return this.makeRequest<SearchResponse>({
      method: 'POST',
      url: '/v1/search',
      data: queryBody,
    });
  }

  /**
   * Execute Lucene query
   */
  public async queryLogs(payload: Record<string, unknown>): Promise<SearchResponse> {
    return this.makeRequest<SearchResponse>({
      method: 'POST',
      url: '/v1/search',
      data: payload,
    });
  }

  /**
   * Get log statistics using search aggregations
   */
  public async getLogStats(params: {
    from?: string;
    to?: string;
    groupBy?: string[];
  }): Promise<LogStatsResponse> {
    // Build aggregation query to get statistics
    const queryBody: any = {
      query: {
        match_all: {}
      },
      size: 0, // We only want aggregations, not individual logs
      aggs: {
        time_histogram: {
          date_histogram: {
            field: '@timestamp',
            interval: this.getTimeInterval(params.from, params.to),
            order: { _key: 'desc' }
          }
        }
      }
    };

    // Add time range filter if specified
    if (params.from || params.to) {
      queryBody.query = {
        bool: {
          filter: {
            range: {
              '@timestamp': {
                ...(params.from && { gte: params.from }),
                ...(params.to && { lte: params.to })
              }
            }
          }
        }
      };
    }

    // Add groupBy aggregations if specified
    if (params.groupBy && params.groupBy.length > 0) {
      params.groupBy.forEach(field => {
        queryBody.aggs[`by_${field}`] = {
          terms: {
            field: `${field}.keyword`,
            size: 20,
            order: { _count: 'desc' }
          }
        };
      });
    }

    // Add common useful aggregations
    queryBody.aggs.by_level = {
      terms: {
        field: 'level.keyword',
        size: 10,
        order: { _count: 'desc' }
      }
    };

    const response = await this.makeRequest<SearchResponse>({
      method: 'POST',
      url: '/v1/search',
      data: queryBody,
    });

    // Transform the response to match LogStatsResponse format
    const total = typeof response.hits?.total === 'number' 
      ? response.hits.total 
      : (response.hits?.total as any)?.value || 0;

    return {
      total,
      timeRange: {
        from: params.from,
        to: params.to,
      },
      took: response.took || 0,
      aggregations: response.aggregations || {},
      buckets: (response.aggregations as any)?.time_histogram?.buckets?.map((bucket: any) => ({
        key: bucket.key_as_string || bucket.key,
        count: bucket.doc_count,
        timestamp: bucket.key_as_string,
      })) || [],
    } as LogStatsResponse;
  }

  /**
   * Calculate appropriate time interval for histograms
   */
  private getTimeInterval(from?: string, to?: string): string {
    if (!from || !to) return '1h';
    
    const start = new Date(from);
    const end = new Date(to);
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    
    if (diffHours <= 6) return '30m';
    if (diffHours <= 24) return '1h';
    if (diffHours <= 72) return '3h';
    if (diffHours <= 168) return '6h';
    return '1d';
  }

  /**
   * Test API connectivity
   */
  public async healthCheck(): Promise<{ status: string; timestamp: string }> {
    // Use search endpoint as health check since no dedicated health endpoint exists
    try {
      await this.makeRequest<SearchResponse>({
        method: 'POST',
        url: '/v1/search',
        data: {
          query: { match_all: {} },
          size: 0  // Don't return any results, just test connectivity
        },
      });
      return { 
        status: 'ok', 
        timestamp: new Date().toISOString() 
      };
    } catch (error) {
      throw new Error(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 