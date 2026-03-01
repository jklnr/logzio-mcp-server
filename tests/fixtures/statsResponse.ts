import type { LogStatsResponse } from '../../src/api/types.js';

export const defaultStatsResponse: LogStatsResponse = {
  total: 25,
  timeRange: {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-01T12:00:00.000Z',
  },
  buckets: [
    {
      key: '2026-01-01T10:00:00.000Z',
      timestamp: '2026-01-01T10:00:00.000Z',
      count: 10,
    },
    {
      key: '2026-01-01T11:00:00.000Z',
      timestamp: '2026-01-01T11:00:00.000Z',
      count: 15,
    },
  ],
  aggregations: {
    by_level: {
      value: 0,
      buckets: [
        {
          key: 'error',
          count: 3,
        },
        {
          key: 'info',
          count: 22,
        },
      ],
    },
  },
};
