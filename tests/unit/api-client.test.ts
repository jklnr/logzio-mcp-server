import { describe, expect, it, vi } from 'vitest';
import { LogzioApiClient } from '../../src/api/client.js';
import type { Config } from '../../src/config.js';
import {
  ApiError,
  AuthenticationError,
  RateLimitError,
} from '../../src/utils/errors.js';
import { defaultSearchResponse } from '../fixtures/searchResponse.js';

const baseConfig: Config = {
  apiKey: 'test-api-key',
  region: 'us',
  logzioUrl: 'https://api.logz.io',
  timeout: 1000,
  retryAttempts: 2,
  retryDelay: 200,
  maxResults: 1000,
};

describe('LogzioApiClient retry behavior', () => {
  it('retries network errors with exponential backoff and then succeeds', async () => {
    const client = new LogzioApiClient(baseConfig);
    const sleepSpy = vi
      .spyOn(client as any, 'sleep')
      .mockResolvedValue(undefined);

    const axiosMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout while requesting'))
      .mockRejectedValueOnce(new Error('ECONNRESET by peer'))
      .mockResolvedValueOnce({ data: defaultSearchResponse });

    (client as any).axios = axiosMock;

    const result = await client.searchLogs({ query: 'error' });

    expect(result).toEqual(defaultSearchResponse);
    expect(axiosMock).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 200);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 400);
  });

  it('uses retryAfter delay from RateLimitError when available', async () => {
    const client = new LogzioApiClient({
      ...baseConfig,
      retryAttempts: 1,
    });
    const sleepSpy = vi
      .spyOn(client as any, 'sleep')
      .mockResolvedValue(undefined);

    const axiosMock = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('Rate limit exceeded', 2500))
      .mockResolvedValueOnce({ data: defaultSearchResponse });

    (client as any).axios = axiosMock;

    await client.searchLogs({ query: 'error' });

    expect(axiosMock).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledWith(2500);
  });
});

describe('LogzioApiClient error mapping', () => {
  it('maps 401 axios response errors to AuthenticationError', () => {
    const client = new LogzioApiClient(baseConfig);
    const handleResponseError = (client as any).handleResponseError.bind(
      client
    );
    const error = {
      isAxiosError: true,
      response: {
        status: 401,
        data: { message: 'unauthorized' },
      },
    };

    expect(() => handleResponseError(error)).toThrow(AuthenticationError);
  });

  it('maps 429 axios response errors to RateLimitError with retryAfter', () => {
    const client = new LogzioApiClient(baseConfig);
    const handleResponseError = (client as any).handleResponseError.bind(
      client
    );
    const error = {
      isAxiosError: true,
      response: {
        status: 429,
        data: { message: 'too many requests' },
        headers: {
          'retry-after': '3',
        },
      },
    };

    try {
      handleResponseError(error);
      throw new Error('Expected RateLimitError');
    } catch (caught) {
      expect(caught).toBeInstanceOf(RateLimitError);
      expect((caught as RateLimitError).retryAfter).toBe(3000);
    }
  });

  it('maps non-auth non-rate-limit HTTP errors to ApiError', () => {
    const client = new LogzioApiClient(baseConfig);
    const handleResponseError = (client as any).handleResponseError.bind(
      client
    );
    const error = {
      isAxiosError: true,
      response: {
        status: 500,
        data: { message: 'server failure' },
      },
    };

    try {
      handleResponseError(error);
      throw new Error('Expected ApiError');
    } catch (caught) {
      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).statusCode).toBe(500);
    }
  });
});

describe('LogzioApiClient getLogStats transformation', () => {
  it('transforms search response into expected LogStatsResponse structure', async () => {
    const client = new LogzioApiClient(baseConfig);
    const axiosMock = vi.fn().mockResolvedValueOnce({
      data: {
        hits: {
          total: { value: 7 },
          hits: [],
        },
        took: 9,
        aggregations: {
          time_histogram: {
            buckets: [
              {
                key: 1735732800000,
                key_as_string: '2026-01-01T12:00:00.000Z',
                doc_count: 7,
              },
            ],
          },
          by_level: {
            buckets: [{ key: 'error', doc_count: 7 }],
          },
        },
      },
    });

    (client as any).axios = axiosMock;

    const result = await client.getLogStats({
      from: '2026-01-01T11:00:00.000Z',
      to: '2026-01-01T12:00:00.000Z',
      groupBy: ['service'],
    });

    const requestPayload = axiosMock.mock.calls[0]?.[0]?.data as
      | { aggs?: Record<string, unknown> }
      | undefined;

    expect(requestPayload).toBeDefined();
    expect(requestPayload?.aggs?.by_level).toBeDefined();
    expect(requestPayload?.aggs?.by_service).toBeDefined();
    expect(result.total).toBe(7);
    expect((result as any).took).toBe(9);
    expect(result.buckets).toEqual([
      {
        key: '2026-01-01T12:00:00.000Z',
        count: 7,
        timestamp: '2026-01-01T12:00:00.000Z',
      },
    ]);
  });
});
