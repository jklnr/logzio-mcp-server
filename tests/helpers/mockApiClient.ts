import { vi } from 'vitest';
import type { LogzioApiClient } from '../../src/api/client.js';

export type MockApiClient = Pick<
  LogzioApiClient,
  'searchLogs' | 'queryLogs' | 'getLogStats' | 'healthCheck'
> & {
  searchLogs: ReturnType<typeof vi.fn<LogzioApiClient['searchLogs']>>;
  queryLogs: ReturnType<typeof vi.fn<LogzioApiClient['queryLogs']>>;
  getLogStats: ReturnType<typeof vi.fn<LogzioApiClient['getLogStats']>>;
  healthCheck: ReturnType<typeof vi.fn<LogzioApiClient['healthCheck']>>;
};

export function createMockApiClient(): MockApiClient {
  return {
    searchLogs: vi.fn<LogzioApiClient['searchLogs']>(),
    queryLogs: vi.fn<LogzioApiClient['queryLogs']>(),
    getLogStats: vi.fn<LogzioApiClient['getLogStats']>(),
    healthCheck: vi.fn<LogzioApiClient['healthCheck']>(),
  };
}
