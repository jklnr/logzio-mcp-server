import { z } from 'zod';
import type { LogzioApiClient } from '../api/client.js';
import { getLogger } from '../utils/logger.js';
import { ToolError, ValidationError } from '../utils/errors.js';
import { parseTimeRange } from '../api/endpoints.js';

/**
 * Log statistics tool parameter schema
 */
export const LogStatsParamsSchema = z.object({
  timeRange: z.string().optional().describe(
    'Time range for statistics. Options: 1h, 6h, 12h, 24h, 3d, 7d, 30d. ' +
    'TIP: Use "24h" for daily patterns, "7d" for weekly trends'
  ),
  from: z.string().datetime().optional().describe(
    'Start time for statistics (ISO 8601 format). Overrides timeRange if provided.'
  ),
  to: z.string().datetime().optional().describe(
    'End time for statistics (ISO 8601 format). Overrides timeRange if provided.'
  ),
  groupBy: z.array(z.string()).optional().describe(
    'Fields to group statistics by. USEFUL FIELDS: level, k8s_namespace_name, k8s_pod_name, container_name, env_id, service'
  ),
});

export type LogStatsParams = z.infer<typeof LogStatsParamsSchema>;

/**
 * Format time buckets for display
 */
function formatTimeBuckets(buckets: any[], timeRange: string): string {
  if (!buckets || buckets.length === 0) {
    return '📊 No time distribution data available\n';
  }

  let result = '📊 **Time Distribution**\n';
  
  // Show top 10 time buckets to avoid overwhelming output
  const topBuckets = buckets.slice(0, 10);
  
  topBuckets.forEach((bucket, index) => {
    const timestamp = bucket.timestamp 
      ? new Date(bucket.timestamp).toLocaleString()
      : bucket.key;
    const count = bucket.count || bucket.doc_count || 0;
    result += `   ${index + 1}. ${timestamp}: ${count.toLocaleString()} logs\n`;
  });

  if (buckets.length > 10) {
    result += `   ... and ${buckets.length - 10} more time periods\n`;
  }

  return result + '\n';
}

/**
 * Format aggregations for display
 */
function formatAggregations(aggregations: any): string {
  if (!aggregations || Object.keys(aggregations).length === 0) {
    return '📈 No aggregation data available\n';
  }

  let result = '📈 **Breakdown by Categories**\n';

  // Process each aggregation
  Object.entries(aggregations).forEach(([field, data]: [string, any]) => {
    if (field === 'time_histogram') return; // Skip, handled separately
    
    const cleanFieldName = field.replace('by_', '').replace('.keyword', '');
    result += `\n🏷️  **${cleanFieldName}:**\n`;
    
    if (data.buckets && Array.isArray(data.buckets)) {
      const topBuckets = data.buckets.slice(0, 10); // Show top 10
      topBuckets.forEach((bucket: any, index: number) => {
        const count = bucket.doc_count || bucket.count || 0;
        const percentage = data.sum_other_doc_count 
          ? Math.round((count / (count + data.sum_other_doc_count)) * 100)
          : '';
        result += `   ${index + 1}. ${bucket.key}: ${count.toLocaleString()} logs${percentage ? ` (${percentage}%)` : ''}\n`;
      });
      
      if (data.buckets.length > 10) {
        result += `   ... and ${data.buckets.length - 10} more values\n`;
      }
    } else if (typeof data.value === 'number') {
      result += `   Value: ${data.value.toLocaleString()}\n`;
    }
  });

  return result + '\n';
}

/**
 * Generate helpful suggestions based on stats results
 */
function generateStatsSuggestions(params: LogStatsParams, response: any): string[] {
  const suggestions: string[] = [];

  // Check if we have enough data
  const total = response.total || 0;
  if (total === 0) {
    suggestions.push('💡 No logs found. Try expanding the time range or checking your filters');
    return suggestions;
  }

  if (total < 10) {
    suggestions.push('💡 Very few logs found. Consider expanding the time range for better insights');
  }

  // Look for common issues in the data
  if (response.aggregations?.by_level?.buckets) {
    const levelBuckets = response.aggregations.by_level.buckets;
    const errorBucket = levelBuckets.find((b: any) => b.key.toLowerCase() === 'error');
    const totalLogs = levelBuckets.reduce((sum: number, b: any) => sum + (b.doc_count || 0), 0);
    
    if (errorBucket && totalLogs > 0) {
      const errorPercentage = Math.round((errorBucket.doc_count / totalLogs) * 100);
      if (errorPercentage > 10) {
        suggestions.push(`⚠️  High error rate detected: ${errorPercentage}% of logs are errors`);
      }
    }
  }

  return suggestions;
}

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
    
    logger.info('Getting log statistics', {
      timeRange: validatedParams.timeRange,
      from: validatedParams.from,
      to: validatedParams.to,
      groupBy: validatedParams.groupBy,
    });

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
    
    logger.info('Statistics retrieved', {
      total: response.total,
      buckets: response.buckets?.length || 0,
      aggregations: Object.keys(response.aggregations || {}).length,
      took: statsDuration,
    });

    // Generate suggestions
    const suggestions = generateStatsSuggestions(validatedParams, response);

    // Format the results
    const total = response.total || 0;
    
    const summary = `📊 **Log Statistics Summary**
📈 Total logs analyzed: ${total.toLocaleString()}
⏱️  Analysis completed in ${statsDuration}ms
📅 Time range: ${timeRangeDisplay} (${from || 'N/A'} to ${to || 'N/A'})
${validatedParams.groupBy ? `🏷️  Grouped by: ${validatedParams.groupBy.join(', ')}` : ''}

${suggestions.length > 0 ? suggestions.join('\n') + '\n' : ''}`;

    // Format time distribution
    const timeDistribution = formatTimeBuckets(response.buckets || [], timeRangeDisplay);
    
    // Format aggregations
    const aggregationResults = formatAggregations(response.aggregations);
    
    return {
      content: [{
        type: 'text',
        text: summary + '\n' + timeDistribution + aggregationResults,
      }],
    };

  } catch (error) {
    logger.error('Get log statistics failed', error);
    
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Invalid parameters: ${error.errors.map(e => e.message).join(', ')}`,
        undefined,
        { zodError: error.errors }
      );
    }
    
    // Enhanced error handling with helpful suggestions
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let enhancedError = `Failed to get log statistics: ${errorMessage}`;
    
    if (errorMessage.includes('timeout')) {
      enhancedError += '\n\n💡 **Suggestions:**\n' +
        '• Try a smaller time range (e.g., "1h" instead of "7d")\n' +
        '• Reduce the number of groupBy fields\n' +
        '• Use search_logs for individual log analysis';
    } else if (errorMessage.includes('aggregation')) {
      enhancedError += '\n\n💡 **Suggestions:**\n' +
        '• Check that groupBy fields exist in your logs\n' +
        '• Common fields: level, k8s_namespace_name, service\n' +
        '• Use search_logs to explore available fields first';
    } else {
      enhancedError += '\n\n💡 **Alternatives:**\n' +
        '• Use search_logs for basic log analysis\n' +
        '• Try query_logs with aggregations for custom stats\n' +
        '• Check your API permissions and region settings';
    }
    
    throw new ToolError(
      enhancedError,
      'get_log_stats',
      { originalError: error }
    );
  }
}

/**
 * MCP tool definition for log statistics
 */
export const logStatsTool = {
  name: 'get_log_stats',
  description: 'Retrieve aggregated log statistics and metrics from Logz.io. Use this tool to analyze log volumes, trends, and distributions over time or by specific fields.\n\n' +
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
        description: 'Time range for statistics. Use "24h" for daily patterns, "7d" for weekly trends',
      },
      from: {
        type: 'string',
        format: 'date-time',
        description: 'Start time for statistics (ISO 8601 format). Overrides timeRange if provided.',
      },
      to: {
        type: 'string',
        format: 'date-time',
        description: 'End time for statistics (ISO 8601 format). Overrides timeRange if provided.',
      },
      groupBy: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'Fields to group statistics by. Useful: level, k8s_namespace_name, k8s_pod_name, service',
      },
    },
    required: [],
  },
}; 