import { z } from 'zod';
import type { LogzioApiClient } from '../api/client.js';
import { getLogger } from '../utils/logger.js';
import { ToolError, ValidationError } from '../utils/errors.js';
import { TimeRangeSchema, LogSeveritySchema } from '../api/types.js';
import { formatLogEntry } from '../utils/logs.js';
import { parseTimeRange } from '../api/endpoints.js';

/**
 * Search logs tool parameter schema
 */
export const SearchLogsParamsSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .describe(
      'Search query string. Can be simple text or use Lucene syntax for advanced queries. ' +
        'EXAMPLES: ' +
        '• Simple text: "error database connection" ' +
        '• App-specific: "myapp" (automatically excludes system logs) ' +
        '• Error focus: "payment failed" ' +
        'COMMON FIELDS: k8s_namespace_name, container_name, level, host, service'
    ),
  timeRange: z
    .string()
    .optional()
    .describe(
      'Time range for the search. Options: 1h, 6h, 12h, 24h, 3d, 7d, 30d. ' +
        'TIP: Start with 24h for broad searches, use 1h for recent issues'
    ),
  from: z
    .string()
    .datetime()
    .optional()
    .describe(
      'Start time for search (ISO 8601 format). Overrides timeRange if provided.'
    ),
  to: z
    .string()
    .datetime()
    .optional()
    .describe(
      'End time for search (ISO 8601 format). Overrides timeRange if provided.'
    ),
  logType: z
    .string()
    .optional()
    .describe(
      'Filter by log type. COMMON VALUES: application, ingress, system, database'
    ),
  severity: LogSeveritySchema.optional().describe(
    'Filter by log severity level. Use "error" for critical issues, "warn" for problems'
  ),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .default(50)
    .describe(
      'Maximum number of log entries to return (1-1000). Use 20 for quick scans, 100+ for analysis'
    ),
  sort: z
    .enum(['asc', 'desc'])
    .default('desc')
    .describe(
      'Sort order by timestamp. Use "desc" for recent-first (recommended), "asc" for chronological'
    ),
});

export type SearchLogsParams = z.infer<typeof SearchLogsParamsSchema>;

/**
 * Detect if a query should be treated as an exact phrase and format it accordingly
 */
function smartPhraseDetection(query: string): string {
  // If already has quotes, field syntax, or boolean operators, leave as-is
  if (
    query.includes('"') ||
    query.includes(':') ||
    query.includes(' AND ') ||
    query.includes(' OR ') ||
    query.includes(' NOT ') ||
    query.includes('*') ||
    query.includes('?')
  ) {
    return query;
  }

  // If it's multiple words that look like a phrase, wrap in quotes for exact matching
  const words = query.trim().split(/\s+/);
  if (words.length > 1) {
    // Check if it looks like a phrase (not individual field values)
    const hasSpecialChars =
      query.includes('-') || query.includes('_') || query.includes('.');
    const isLikelyPhrase =
      words.length <= 6 &&
      (hasSpecialChars || words.some((word) => word.length > 3));

    if (isLikelyPhrase) {
      return `"${query}"`;
    }
  }

  return query;
}

/**
 * Generate smart query suggestions based on input
 */
function generateQuerySuggestions(
  query: string,
  params: SearchLogsParams
): string[] {
  const suggestions: string[] = [];

  // If no time range specified, suggest appropriate ranges
  if (!params.timeRange && !params.from && !params.to) {
    suggestions.push(
      '💡 Tip: Add timeRange="1h" for recent issues or "24h" for broader analysis'
    );
  }

  // If no severity filter, suggest focusing on errors for debugging
  if (!params.severity && query.toLowerCase().includes('error')) {
    suggestions.push(
      '💡 Tip: Add severity="error" to focus on critical issues'
    );
  }

  // Provide tips about search precision
  if (query && !query.includes('"') && query.split(/\s+/).length > 1) {
    suggestions.push(
      '💡 Search precision: Multi-word queries are automatically treated as exact phrases. Use individual words for broader matching.'
    );
  }

  return suggestions;
}

/**
 * Search logs tool implementation
 */
export async function searchLogs(
  client: LogzioApiClient,
  params: SearchLogsParams
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const logger = getLogger('search-logs');

  try {
    // Validate parameters
    const validatedParams = SearchLogsParamsSchema.parse(params);

    logger.info(
      {
        query: validatedParams.query,
        timeRange: validatedParams.timeRange,
        limit: validatedParams.limit,
      },
      'Searching logs'
    );

    // Apply smart phrase detection
    const enhancedQuery = smartPhraseDetection(validatedParams.query);
    const wasQuoted =
      enhancedQuery !== validatedParams.query && enhancedQuery.includes('"');

    if (wasQuoted) {
      logger.info(
        { originalQuery: validatedParams.query, enhancedQuery },
        'Applied smart phrase detection'
      );
    }

    // Determine time range
    let from = validatedParams.from;
    let to = validatedParams.to;

    if (!from || !to) {
      const timeRange = parseTimeRange(validatedParams.timeRange || '24h');
      from = from || timeRange.from;
      to = to || timeRange.to;
    }

    // Build search parameters
    const searchParams: any = {
      query: enhancedQuery,
      size: validatedParams.limit,
      sort:
        validatedParams.sort === 'desc' ? '@timestamp:desc' : '@timestamp:asc',
    };

    if (from) searchParams.from = from;
    if (to) searchParams.to = to;
    if (validatedParams.logType) searchParams.type = validatedParams.logType;

    // Add severity filter to query if specified
    if (validatedParams.severity) {
      searchParams.query += ` AND level:${validatedParams.severity}`;
    }

    // Record search start time
    const searchStartTime = Date.now();

    // Execute search
    const response = await client.searchLogs(searchParams);

    // Calculate actual search time
    const searchDuration = Date.now() - searchStartTime;

    if (!response.hits || !response.hits.hits) {
      const suggestions = generateQuerySuggestions(
        validatedParams.query,
        validatedParams
      );
      const suggestionText =
        suggestions.length > 0 ? '\n\n' + suggestions.join('\n') : '';

      return {
        content: [
          {
            type: 'text',
            text: `No logs found matching the search criteria.${suggestionText}`,
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
        took: searchDuration,
      },
      'Search completed'
    );

    // Generate suggestions for query improvement
    const suggestions = generateQuerySuggestions(
      validatedParams.query,
      validatedParams
    );

    // Format results with improved structure
    const formattedLogs = logs.map((hit, index) =>
      formatLogEntry(hit._source, index)
    );

    // Create comprehensive summary
    const summary = `🔍 **Search Results**
📊 Found ${total.toLocaleString()} total logs (showing top ${logs.length})
⏱️  Search completed in ${searchDuration}ms
🔎 Query: "${validatedParams.query}"${wasQuoted ? ' [exact phrase]' : ''}
📅 Time range: ${from || 'N/A'} to ${to || 'N/A'}
${validatedParams.severity ? `📈 Severity: ${validatedParams.severity}` : ''}
${validatedParams.logType ? `🏷️  Log type: ${validatedParams.logType}` : ''}

${suggestions.length > 0 ? suggestions.join('\n') + '\n' : ''}`;

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
    logger.error(error as Error, 'Search logs failed');

    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
        undefined,
        { zodError: error.issues }
      );
    }

    throw new ToolError(
      `Failed to search logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'search_logs',
      { originalError: error }
    );
  }
}

/**
 * MCP tool definition for search logs
 */
export const searchLogsTool = {
  name: 'search_logs',
  description:
    'Search through Logz.io logs with filters and time ranges. Use this tool to find specific log entries, debug issues, or analyze application behavior. ' +
    '\n\n🎯 **EXAMPLES:**\n' +
    '• Simple text: query="error database connection"\n' +
    '• App-specific: query="myapp"\n' +
    '• Time-sensitive: query="payment failed" + timeRange="1h"\n' +
    '• Error focus: query="timeout" + severity="error"\n' +
    '\n🔍 **SEARCH PRECISION:**\n' +
    '• Multi-word queries are automatically treated as exact phrases\n' +
    '• "this-should-not-return-results" will match exactly, not individual words\n' +
    '• Use quotes explicitly for complex phrases: "error AND warning"\n' +
    '• Use individual words for broader matching\n' +
    '\n🏷️ **COMMON FIELDS:** k8s_namespace_name, k8s_pod_name, container_name, level, host, service, env_id\n' +
    '\n💡 **TIPS:**\n' +
    '• Use timeRange="1h" for recent issues, "24h" for broader analysis\n' +
    '• Add severity="error" to focus on critical problems\n' +
    '• For complex filtering, use mcp_logzio_query_logs instead',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query string. Examples: "error database", "myapp", "payment failed"',
      },
      timeRange: {
        type: 'string',
        enum: ['1h', '6h', '12h', '24h', '3d', '7d', '30d'],
        description:
          'Time range for the search. Start with "24h" for analysis, "1h" for recent issues',
      },
      from: {
        type: 'string',
        format: 'date-time',
        description:
          'Start time for search (ISO 8601 format). Overrides timeRange if provided.',
      },
      to: {
        type: 'string',
        format: 'date-time',
        description:
          'End time for search (ISO 8601 format). Overrides timeRange if provided.',
      },
      logType: {
        type: 'string',
        description:
          'Filter by log type. Common values: application, ingress, system, database',
      },
      severity: {
        type: 'string',
        enum: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
        description:
          'Filter by log severity level. Use "error" for critical issues',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 1000,
        default: 50,
        description:
          'Maximum number of log entries to return. Use 20 for quick scans, 100+ for analysis',
      },
      sort: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'desc',
        description:
          'Sort order by timestamp. "desc" shows recent logs first (recommended)',
      },
    },
    required: ['query'],
  },
};
