import type { SearchResponse } from '../../src/api/types.js';

export const defaultSearchResponse: SearchResponse = {
  hits: {
    total: 2,
    hits: [
      {
        _id: 'doc-1',
        _source: {
          '@timestamp': '2026-01-01T10:00:00.000Z',
          message: 'database connection timeout',
          level: 'error',
          service: 'api',
        },
      },
      {
        _id: 'doc-2',
        _source: {
          '@timestamp': '2026-01-01T10:05:00.000Z',
          message: 'retry successful',
          level: 'info',
          service: 'api',
        },
      },
    ],
  },
  took: 12,
  timed_out: false,
};
