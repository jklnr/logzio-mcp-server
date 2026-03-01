import type { LogStatsResponse, SearchResponse } from './types.js';

/**
 * Build Elasticsearch query body for search
 */
export function buildSearchQuery(params: {
  query: string;
  from?: string;
  to?: string;
  size?: number;
  sort?: string;
}): Record<string, unknown> {
  const queryBody: Record<string, unknown> = {
    query: {
      query_string: {
        query: params.query,
      },
    },
    size: params.size || 50,
  };

  if (params.from || params.to) {
    queryBody.query = {
      bool: {
        must: [queryBody.query],
        filter: {
          range: {
            '@timestamp': {
              ...(params.from && { gte: params.from }),
              ...(params.to && { lte: params.to }),
            },
          },
        },
      },
    };
  }

  if (params.sort?.includes('desc')) {
    queryBody.sort = [{ '@timestamp': { order: 'desc' } }];
  } else {
    queryBody.sort = [
      {
        '@timestamp': { order: params.sort?.includes('asc') ? 'asc' : 'desc' },
      },
    ];
  }

  return queryBody;
}

/**
 * Calculate appropriate time interval for histograms
 */
export function getTimeInterval(from?: string, to?: string): string {
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
 * Build aggregation query for log statistics
 */
export function buildStatsQuery(
  params: { from?: string; to?: string; groupBy?: string[] },
  getTimeIntervalFn: (from?: string, to?: string) => string
): Record<string, unknown> {
  const aggs: Record<string, unknown> = {
    time_histogram: {
      date_histogram: {
        field: '@timestamp',
        interval: getTimeIntervalFn(params.from, params.to),
        order: { _key: 'desc' },
      },
    },
  };

  if (params.groupBy?.length) {
    for (const field of params.groupBy) {
      aggs[`by_${field}`] = {
        terms: {
          field: `${field}.keyword`,
          size: 20,
          order: { _count: 'desc' },
        },
      };
    }
  }

  aggs.by_level = {
    terms: {
      field: 'level.keyword',
      size: 10,
      order: { _count: 'desc' },
    },
  };

  const queryBody: Record<string, unknown> = {
    query: { match_all: {} },
    size: 0,
    aggs,
  };

  if (params.from || params.to) {
    queryBody.query = {
      bool: {
        filter: {
          range: {
            '@timestamp': {
              ...(params.from && { gte: params.from }),
              ...(params.to && { lte: params.to }),
            },
          },
        },
      },
    };
  }

  return queryBody;
}

/**
 * Transform SearchResponse to LogStatsResponse
 */
export function transformToLogStatsResponse(
  response: SearchResponse,
  params: { from?: string; to?: string }
): LogStatsResponse {
  const totalRaw = response.hits?.total;
  const total =
    typeof totalRaw === 'number'
      ? totalRaw
      : typeof totalRaw === 'object' && totalRaw !== null
        ? (totalRaw as { value?: number }).value || 0
        : 0;

  const timeHistogram = (response.aggregations as Record<string, unknown>)
    ?.time_histogram as Record<string, unknown> | undefined;
  const rawBuckets = timeHistogram?.buckets;
  const buckets = Array.isArray(rawBuckets)
    ? (rawBuckets as Array<Record<string, unknown>>).map(
        (bucket: Record<string, unknown>) => ({
          key: bucket.key_as_string || bucket.key,
          count: bucket.doc_count,
          timestamp: bucket.key_as_string,
        })
      )
    : [];

  return {
    total,
    timeRange: { from: params.from, to: params.to },
    took: response.took || 0,
    aggregations: response.aggregations || {},
    buckets,
  } as LogStatsResponse;
}
