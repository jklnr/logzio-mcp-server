/**
 * Logz.io API endpoint definitions
 */
export const API_ENDPOINTS = {
  // Search API endpoints
  SEARCH: '/v1/search',
  LUCENE_SEARCH: '/v1/search',
  
  // Statistics API endpoints
  STATS: '/v1/statistics',
  AGGREGATIONS: '/v1/aggregations',
  
  // Account API endpoints
  ACCOUNT_INFO: '/v1/account',
  
  // Health check
  HEALTH: '/v1/health',
} as const;

/**
 * Build URL with query parameters
 */
export function buildUrl(
  baseUrl: string,
  endpoint: string,
  params?: Record<string, unknown>
): string {
  const url = new URL(endpoint, baseUrl);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  
  return url.toString();
}

/**
 * Build search query parameters
 */
export function buildSearchParams(query: {
  q?: string;
  from?: string;
  to?: string;
  size?: number;
  sort?: string;
  index?: string;
  type?: string;
}): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  
  if (query.q) params.q = query.q;
  if (query.from) params.from = query.from;
  if (query.to) params.to = query.to;
  if (query.size) params.size = query.size;
  if (query.sort) params.sort = query.sort;
  if (query.index) params.index = query.index;
  if (query.type) params.type = query.type;
  
  return params;
}

/**
 * Build Lucene query payload
 */
export function buildLuceneQuery(query: {
  query: string;
  from?: string;
  to?: string;
  size?: number;
  sort?: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    query: {
      query_string: {
        query: query.query,
      },
    },
  };
  
  if (query.size) {
    payload.size = query.size;
  }
  
  if (query.from || query.to) {
    payload.query = {
      bool: {
        must: [
          {
            query_string: {
              query: query.query,
            },
          },
        ],
        filter: {
          range: {
            '@timestamp': {
              ...(query.from && { gte: query.from }),
              ...(query.to && { lte: query.to }),
            },
          },
        },
      },
    };
  }
  
  if (query.sort) {
    payload.sort = query.sort;
  } else {
    payload.sort = [{ '@timestamp': { order: 'desc' } }];
  }
  
  return payload;
}

/**
 * Parse time range into from/to dates
 */
export function parseTimeRange(timeRange?: string): { from?: string; to?: string } {
  if (!timeRange) return {};
  
  const now = new Date();
  const to = now.toISOString();
  
  switch (timeRange) {
    case '1h':
      return {
        from: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        to,
      };
    case '6h':
      return {
        from: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
        to,
      };
    case '12h':
      return {
        from: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
        to,
      };
    case '24h':
      return {
        from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        to,
      };
    case '3d':
      return {
        from: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        to,
      };
    case '7d':
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to,
      };
    case '30d':
      return {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to,
      };
    default:
      return {};
  }
} 