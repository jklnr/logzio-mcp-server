import { z } from 'zod';
import type { LogzioApiClient } from '../api/client.js';
import { getLogger } from '../utils/logger.js';
import { ToolError, ValidationError } from '../utils/errors.js';
import {
  buildQueryError,
  buildQueryPayload,
  formatQueryResult,
} from './queryHelpers.js';

/**
 * Query logs tool parameter schema
 */
export const QueryLogsParamsSchema = z.object({
  luceneQuery: z
    .string()
    .min(1, 'Lucene query cannot be empty')
    .describe(
      'Lucene query string for precise log analysis. ' +
        'EXAMPLES:\n' +
        '• Field searches: level:ERROR, host:web*, service:myapp\n' +
        '• Boolean logic: (ERROR OR WARN) AND service:api\n' +
        '• Ranges: timestamp:[2024-01-01 TO 2024-01-31]\n' +
        '• Wildcards: message:timeout*\n' +
        '• Exclusions: level:ERROR AND NOT k8s_namespace_name:monitoring\n' +
        '• Kubernetes: k8s_pod_name:myapp* AND env_id:prod\n' +
        'COMMON PATTERNS:\n' +
        '• App errors: "service:myapp AND level:ERROR"\n' +
        '• HTTP errors: "status_code:[400 TO 599]"\n' +
        '• Pod issues: "k8s_pod_name:*myapp* AND (ERROR OR WARN)"'
    ),
  from: z
    .string()
    .datetime()
    .optional()
    .describe(
      'Start time for search (ISO 8601 format). Example: "2024-01-01T00:00:00Z"'
    ),
  to: z
    .string()
    .datetime()
    .optional()
    .describe(
      'End time for search (ISO 8601 format). Example: "2024-01-01T23:59:59Z"'
    ),
  size: z
    .number()
    .min(1)
    .max(1000)
    .default(100)
    .describe(
      'Maximum number of log entries to return (1-1000). Use 50 for quick analysis, 200+ for deep investigation'
    ),
  sort: z
    .enum(['asc', 'desc'])
    .default('desc')
    .describe(
      'Sort order by timestamp. "desc" shows recent logs first (recommended for troubleshooting)'
    ),
});

export type QueryLogsParams = z.infer<typeof QueryLogsParamsSchema>;

function getQueryComplexity(query: string): 'simple' | 'moderate' | 'complex' {
  const hasBoolean =
    query.includes(' AND ') ||
    query.includes(' OR ') ||
    query.includes(' NOT ');
  const hasRanges = query.includes('[') && query.includes(' TO ');
  const hasWildcards = query.includes('*') || query.includes('?');
  const hasParentheses = query.includes('(') && query.includes(')');

  if (hasWildcards && hasBoolean && hasParentheses) return 'complex';
  if (hasBoolean || hasRanges) return 'moderate';
  return 'simple';
}

function getQueryWarnings(query: string): string[] {
  const warnings: string[] = [];
  if (query.startsWith('*') || query.includes(':*')) {
    warnings.push('⚠️  Wildcard at beginning of query may be slow');
  }
  if (query.includes('message:*')) {
    warnings.push('⚠️  Wildcard searches on message field can be expensive');
  }
  return warnings;
}

function analyzeLuceneQuery(query: string): {
  complexity: 'simple' | 'moderate' | 'complex';
  suggestions: string[];
  warnings: string[];
} {
  return {
    complexity: getQueryComplexity(query),
    suggestions: [],
    warnings: getQueryWarnings(query),
  };
}

/**
 * Query logs tool implementation
 */
export async function queryLogs(
  client: LogzioApiClient,
  params: QueryLogsParams
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const logger = getLogger('query-logs');

  try {
    const validatedParams = QueryLogsParamsSchema.parse(params);
    logger.info(
      { query: validatedParams.luceneQuery, size: validatedParams.size },
      'Executing Lucene query'
    );

    const queryAnalysis = analyzeLuceneQuery(validatedParams.luceneQuery);
    const queryPayload = buildQueryPayload(validatedParams);
    const queryStartTime = Date.now();

    const response = await client.queryLogs(queryPayload);
    const queryDuration = Date.now() - queryStartTime;

    if (!response.hits?.hits) {
      return {
        content: [
          {
            type: 'text',
            text: `No logs found matching the Lucene query.\n\n${queryAnalysis.suggestions.join('\n')}\n\n${queryAnalysis.warnings.join('\n')}`,
          },
        ],
      };
    }

    logger.info(
      {
        total:
          typeof response.hits.total === 'number'
            ? response.hits.total
            : (response.hits.total as { value?: number })?.value || 0,
        returned: response.hits.hits.length,
        took: queryDuration,
        complexity: queryAnalysis.complexity,
      },
      'Query completed'
    );

    return formatQueryResult(
      response,
      validatedParams,
      queryAnalysis,
      queryDuration
    );
  } catch (error) {
    logger.error(error as Error, 'Query logs failed');

    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
        undefined,
        { zodError: error.issues }
      );
    }

    throw new ToolError(buildQueryError(error), 'query_logs', {
      originalError: error,
    });
  }
}

/**
 * MCP tool definition for query logs
 */
export const queryLogsTool = {
  name: 'query_logs',
  description:
    'Execute advanced Lucene queries against Logz.io logs. Supports complex search syntax including field searches, boolean operators, wildcards, ranges, and more. Use this for precise log analysis and complex filtering requirements.\n\n' +
    '🎯 **LUCENE SYNTAX EXAMPLES:**\n' +
    '• Field searches: level:ERROR, host:web*, service:api\n' +
    '• Boolean logic: (ERROR OR WARN) AND service:api\n' +
    '• Ranges: status_code:[400 TO 499], timestamp:[2024-01-01 TO 2024-01-31]\n' +
    '• Wildcards: message:timeout*, k8s_pod_name:pod-name*\n' +
    '• Exclusions: level:ERROR AND NOT k8s_namespace_name:monitoring\n' +
    '\n🏷️ **COMMON PATTERNS:**\n' +
    '• App errors: "service:myapp AND level:ERROR"\n' +
    '• HTTP errors: "status_code:[400 TO 599]"\n' +
    '• Pod issues: "k8s_pod_name:*myapp* AND (ERROR OR WARN)"\n' +
    '• Time-based: "level:ERROR AND timestamp:[now-1h TO now]"\n' +
    '\n⚡ **PERFORMANCE TIPS:**\n' +
    '• Avoid leading wildcards (*term)\n' +
    '• Use specific fields instead of full-text search\n' +
    '• Combine with time ranges for faster queries\n' +
    '\n💡 **TIP:** For simple text searches, use search_logs instead.',
  inputSchema: {
    type: 'object',
    properties: {
      luceneQuery: {
        type: 'string',
        description:
          'Lucene query string. Examples: "level:ERROR", "message:exception AND host:web*", "status:[400 TO 499]"',
      },
      from: {
        type: 'string',
        format: 'date-time',
        description: 'Start time for search (ISO 8601 format)',
      },
      to: {
        type: 'string',
        format: 'date-time',
        description: 'End time for search (ISO 8601 format)',
      },
      size: {
        type: 'number',
        minimum: 1,
        maximum: 1000,
        default: 100,
        description:
          'Maximum number of log entries to return. Use 50 for quick analysis, 200+ for deep investigation',
      },
      sort: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'desc',
        description:
          'Sort order by timestamp. "desc" shows recent logs first (recommended)',
      },
    },
    required: ['luceneQuery'],
  },
};
