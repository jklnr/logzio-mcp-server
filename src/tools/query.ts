import { z } from 'zod';
import type { LogzioApiClient } from '../api/client.js';
import { getLogger } from '../utils/logger.js';
import { ToolError, ValidationError } from '../utils/errors.js';
import { formatLogEntry } from '../utils/logs.js';
import { buildLuceneQuery } from '../api/endpoints.js';

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

/**
 * Analyze and provide suggestions for Lucene queries
 */
function analyzeLuceneQuery(query: string): {
  complexity: 'simple' | 'moderate' | 'complex';
  suggestions: string[];
  warnings: string[];
} {
  const suggestions: string[] = [];
  const warnings: string[] = [];

  // Analyze query complexity
  const hasBoolean =
    query.includes(' AND ') ||
    query.includes(' OR ') ||
    query.includes(' NOT ');
  const hasRanges = query.includes('[') && query.includes(' TO ');
  const hasWildcards = query.includes('*') || query.includes('?');
  const hasParentheses = query.includes('(') && query.includes(')');

  let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
  if (hasBoolean || hasRanges) complexity = 'moderate';
  if (hasWildcards && hasBoolean && hasParentheses) complexity = 'complex';

  // Performance suggestions
  if (query.startsWith('*') || query.includes(':*')) {
    warnings.push('⚠️  Wildcard at beginning of query may be slow');
  }

  if (query.includes('message:*')) {
    warnings.push('⚠️  Wildcard searches on message field can be expensive');
  }

  return { complexity, suggestions, warnings };
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
    // Validate parameters
    const validatedParams = QueryLogsParamsSchema.parse(params);

    logger.info(
      {
        query: validatedParams.luceneQuery,
        size: validatedParams.size,
      },
      'Executing Lucene query'
    );

    // Analyze query for suggestions
    const queryAnalysis = analyzeLuceneQuery(validatedParams.luceneQuery);

    // Build query payload
    const queryConfig: {
      query: string;
      size: number;
      sort: Array<Record<string, unknown>>;
      from?: string;
      to?: string;
    } = {
      query: validatedParams.luceneQuery,
      size: validatedParams.size,
      sort:
        validatedParams.sort === 'desc'
          ? [{ '@timestamp': { order: 'desc' } }]
          : [{ '@timestamp': { order: 'asc' } }],
    };

    if (validatedParams.from) {
      queryConfig.from = validatedParams.from;
    }

    if (validatedParams.to) {
      queryConfig.to = validatedParams.to;
    }

    const queryPayload = buildLuceneQuery(queryConfig);

    // Record query start time
    const queryStartTime = Date.now();

    // Execute query
    const response = await client.queryLogs(queryPayload);

    // Calculate actual query time
    const queryDuration = Date.now() - queryStartTime;

    if (!response.hits || !response.hits.hits) {
      return {
        content: [
          {
            type: 'text',
            text: `No logs found matching the Lucene query.\n\n${queryAnalysis.suggestions.join('\n')}\n\n${queryAnalysis.warnings.join('\n')}`,
          },
        ],
      };
    }

    const logs = response.hits.hits;
    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : (response.hits.total as any)?.value || 0;

    logger.info(
      {
        total,
        returned: logs.length,
        took: queryDuration,
        complexity: queryAnalysis.complexity,
      },
      'Query completed'
    );

    // Format results with improved structure
    const formattedLogs = logs.map((hit, index) =>
      formatLogEntry(hit._source, index)
    );

    // Create comprehensive summary
    const summary = `🔍 **Lucene Query Results**
📊 Found ${total.toLocaleString()} total logs (showing top ${logs.length})
⏱️  Query completed in ${queryDuration}ms
🧮 Query complexity: ${queryAnalysis.complexity}
🔎 Lucene query: \`${validatedParams.luceneQuery}\`
📅 Time range: ${validatedParams.from || 'N/A'} to ${validatedParams.to || 'N/A'}

${queryAnalysis.warnings.length > 0 ? queryAnalysis.warnings.join('\n') + '\n' : ''}
${queryAnalysis.suggestions.length > 0 ? queryAnalysis.suggestions.join('\n') + '\n' : ''}`;

    const logEntries = formattedLogs.join('\n\n---\n\n');

    return {
      content: [
        {
          type: 'text',
          text: summary + '\n\n📝 **Log Entries**\n\n' + logEntries,
        },
      ],
    };
  } catch (error) {
    logger.error(error as Error, 'Query logs failed');

    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
        undefined,
        { zodError: error.issues }
      );
    }

    // Enhanced error handling for Lucene syntax errors
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    let enhancedError = `Failed to execute Lucene query: ${errorMessage}`;

    if (
      errorMessage.includes('parsing_exception') ||
      errorMessage.includes('syntax')
    ) {
      enhancedError +=
        '\n\n🔧 **Lucene Syntax Help:**\n' +
        '• Field searches: level:ERROR, host:web*\n' +
        '• Boolean: (ERROR OR WARN) AND service:api\n' +
        '• Ranges: timestamp:[2024-01-01 TO 2024-01-31]\n' +
        '• Exclusions: level:ERROR AND NOT k8s_namespace_name:monitoring\n\n' +
        '💡 Try using the search_logs tool for simpler text searches.';
    }

    throw new ToolError(enhancedError, 'query_logs', { originalError: error });
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
