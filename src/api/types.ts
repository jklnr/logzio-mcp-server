import { z } from 'zod';

/**
 * Common timestamp range schema
 */
export const TimeRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  timeRange: z.enum(['1h', '6h', '12h', '24h', '3d', '7d', '30d']).optional(),
});

export type TimeRange = z.infer<typeof TimeRangeSchema>;

/**
 * Log severity levels
 */
export const LogSeveritySchema = z.enum([
  'trace',
  'debug', 
  'info',
  'warn',
  'error',
  'fatal',
]);

export type LogSeverity = z.infer<typeof LogSeveritySchema>;

/**
 * Search logs request schema
 */
export const SearchLogsRequestSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  timeRange: TimeRangeSchema.optional(),
  logType: z.string().optional(),
  severity: LogSeveritySchema.optional(),
  limit: z.number().min(1).max(10000).default(100),
  offset: z.number().min(0).default(0),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export type SearchLogsRequest = z.infer<typeof SearchLogsRequestSchema>;

/**
 * Lucene query request schema
 */
export const LuceneQueryRequestSchema = z.object({
  luceneQuery: z.string().min(1, 'Lucene query cannot be empty'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  size: z.number().min(1).max(10000).default(100),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export type LuceneQueryRequest = z.infer<typeof LuceneQueryRequestSchema>;

/**
 * Log statistics request schema
 */
export const LogStatsRequestSchema = z.object({
  timeRange: TimeRangeSchema,
  groupBy: z.array(z.string()).optional(),
  filters: z.record(z.string(), z.string()).optional(),
});

export type LogStatsRequest = z.infer<typeof LogStatsRequestSchema>;

/**
 * Log entry response structure
 */
export interface LogEntry {
  '@timestamp': string;
  message: string;
  level?: string;
  type?: string;
  host?: string;
  source?: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * Search response structure
 */
export interface SearchResponse {
  hits: {
    total: number;
    hits: Array<{
      _id: string;
      _source: LogEntry;
      _score?: number;
    }>;
  };
  took: number;
  timed_out: boolean;
  aggregations?: Record<string, unknown>;
}

/**
 * Log statistics response structure
 */
export interface LogStatsResponse {
  total: number;
  timeRange: TimeRange;
  buckets?: Array<{
    key: string;
    count: number;
    timestamp?: string;
  }>;
  aggregations?: Record<string, {
    value: number;
    buckets?: Array<{ key: string; count: number }>;
  }>;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total?: number;
    page?: number;
    size?: number;
    took?: number;
  };
}

/**
 * Pagination parameters
 */
export const PaginationSchema = z.object({
  page: z.number().min(0).default(0),
  size: z.number().min(1).max(10000).default(100),
});

export type Pagination = z.infer<typeof PaginationSchema>;

/**
 * Sort parameters
 */
export const SortSchema = z.object({
  field: z.string().default('@timestamp'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type Sort = z.infer<typeof SortSchema>; 