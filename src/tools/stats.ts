import { z } from 'zod';
import type { LogzioApiClient } from '../api/client.js';
import { getLogger } from '../utils/logger.js';
import { ToolError, ValidationError } from '../utils/errors.js';
import { parseTimeRange } from '../api/endpoints.js';
import {
  buildStatsError,
  formatAggregations,
  formatTimeBuckets,
  generateStatsSuggestions,
} from './statsHelpers.js';

/**
 * Log statistics tool parameter schema
 */
export const LogStatsParamsSchema = z.object({
  timeRange: z
    .string()
    .optional()
    .describe(
      'Time range for statistics. Options: 1h, 6h, 12h, 24h, 3d, 7d, 30d. ' +
        'TIP: Use "24h" for daily patterns, "7d" for weekly trends'
    ),
  from: z
    .string()
    .datetime()
    .optional()
    .describe(
      'Start time for statistics (ISO 8601 format). Overrides timeRange if provided.'
    ),
  to: z
    .string()
    .datetime()
    .optional()
    .describe(
      'End time for statistics (ISO 8601 format). Overrides timeRange if provided.'
    ),
  groupBy: z
    .array(z.string())
    .optional()
    .describe(
      'Fields to group statistics by. USEFUL FIELDS: level, k8s_namespace_name, k8s_pod_name, container_name, env_id, service'
    ),
});

export type LogStatsParams = z.infer<typeof LogStatsParamsSchema>;

/**
 * Log statistics tool implementation
 */
export async function getLogStats(
  client: LogzioApiClient,
  params: LogStatsParams
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const logger = getLogger('log-stats');

  try {
    // Validate parameters
    const validatedParams = LogStatsParamsSchema.parse(params);

    logger.info(
      {
        timeRange: validatedParams.timeRange,
        from: validatedParams.from,
        to: validatedParams.to,
        groupBy: validatedParams.groupBy,
      },
      'Getting log statistics'
    );

    // Determine time range
    let from = validatedParams.from;
    let to = validatedParams.to;
    let timeRangeDisplay = validatedParams.timeRange || 'custom';

    if (!from || !to) {
      const timeRange = parseTimeRange(validatedParams.timeRange || '24h');
      from = from || timeRange.from;
      to = to || timeRange.to;
      timeRangeDisplay = validatedParams.timeRange || '24h';
    }

    // Build statistics parameters
    const statsParams: {
      from?: string;
      to?: string;
      groupBy?: string[];
    } = {};

    if (from) statsParams.from = from;
    if (to) statsParams.to = to;
    if (validatedParams.groupBy) statsParams.groupBy = validatedParams.groupBy;

    // Record stats start time
    const statsStartTime = Date.now();

    // Get statistics
    const response = await client.getLogStats(statsParams);

    // Calculate actual stats time
    const statsDuration = Date.now() - statsStartTime;

    logger.info(
      {
        total: response.total,
        buckets: response.buckets?.length || 0,
        aggregations: Object.keys(response.aggregations || {}).length,
        took: statsDuration,
      },
      'Statistics retrieved'
    );

    const suggestions = generateStatsSuggestions(response);

    // Format the results
    const total = response.total || 0;

    const summary = `📊 **Log Statistics Summary**
📈 Total logs analyzed: ${total.toLocaleString()}
⏱️  Analysis completed in ${statsDuration}ms
📅 Time range: ${timeRangeDisplay} (${from || 'N/A'} to ${to || 'N/A'})
${validatedParams.groupBy ? `🏷️  Grouped by: ${validatedParams.groupBy.join(', ')}` : ''}

${suggestions.length > 0 ? suggestions.join('\n') + '\n' : ''}`;

    // Format time distribution
    const timeDistribution = formatTimeBuckets(response.buckets || []);

    // Format aggregations
    const aggregationResults = formatAggregations(response.aggregations || {});

    return {
      content: [
        {
          type: 'text',
          text: summary + '\n' + timeDistribution + aggregationResults,
        },
      ],
    };
  } catch (error) {
    logger.error(error as Error, 'Get log statistics failed');

    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
        undefined,
        { zodError: error.issues }
      );
    }

    throw new ToolError(buildStatsError(error), 'get_log_stats', {
      originalError: error,
    });
  }
}

/**
 * MCP tool definition for log statistics
 */
export const logStatsTool = {
  name: 'get_log_stats',
  description:
    'Retrieve aggregated log statistics and metrics from Logz.io. Use this tool to analyze log volumes, trends, and distributions over time or by specific fields.\n\n' +
    '🎯 **EXAMPLES:**\n' +
    '• Volume analysis: timeRange="24h" (shows hourly log distribution)\n' +
    '• Error analysis: timeRange="1h" + groupBy=["level"] (shows error/warning/info breakdown)\n' +
    '• Service analysis: groupBy=["k8s_namespace_name", "service"] (shows activity by service)\n' +
    '• Pod analysis: groupBy=["k8s_pod_name"] (shows which pods are logging most)\n' +
    '\n🏷️ **USEFUL GROUP-BY FIELDS:**\n' +
    '• level - See error/warning/info distribution\n' +
    '• k8s_namespace_name - Activity by Kubernetes namespace\n' +
    '• k8s_pod_name - Activity by pod\n' +
    '• container_name - Activity by container\n' +
    '• env_id - Activity by environment\n' +
    '• service - Activity by service name\n' +
    '\n💡 **PERFORMANCE TIPS:**\n' +
    '• Start with shorter time ranges (1h, 6h) for faster results\n' +
    '• Limit groupBy to 2-3 fields for readability\n' +
    '• Use this for trends, search_logs for individual log inspection',
  inputSchema: {
    type: 'object',
    properties: {
      timeRange: {
        type: 'string',
        enum: ['1h', '6h', '12h', '24h', '3d', '7d', '30d'],
        description:
          'Time range for statistics. Use "24h" for daily patterns, "7d" for weekly trends',
      },
      from: {
        type: 'string',
        format: 'date-time',
        description:
          'Start time for statistics (ISO 8601 format). Overrides timeRange if provided.',
      },
      to: {
        type: 'string',
        format: 'date-time',
        description:
          'End time for statistics (ISO 8601 format). Overrides timeRange if provided.',
      },
      groupBy: {
        type: 'array',
        items: {
          type: 'string',
        },
        description:
          'Fields to group statistics by. Useful: level, k8s_namespace_name, k8s_pod_name, service',
      },
    },
    required: [],
  },
};
