type AggregationData = {
  buckets?: Array<{ key?: string; doc_count?: number }>;
  value?: number;
  sum_other_doc_count?: number;
};

export function formatTimeBuckets(
  buckets: Array<{
    timestamp?: string;
    key?: string;
    count?: number;
    doc_count?: number;
  }>
): string {
  if (!buckets?.length) return '📊 No time distribution data available\n';

  let result = '📊 **Time Distribution**\n';
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

export function formatAggregations(
  aggregations: Record<string, AggregationData>
): string {
  if (!aggregations || Object.keys(aggregations).length === 0) {
    return '📈 No aggregation data available\n';
  }

  let result = '📈 **Breakdown by Categories**\n';

  for (const [field, data] of Object.entries(aggregations)) {
    if (field === 'time_histogram') continue;

    const cleanFieldName = field.replace('by_', '').replace('.keyword', '');
    result += `\n🏷️  **${cleanFieldName}:**\n`;

    if (data.buckets?.length) {
      const topBuckets = data.buckets.slice(0, 10);
      for (let i = 0; i < topBuckets.length; i++) {
        const bucket = topBuckets[i];
        const count = bucket.doc_count ?? bucket.count ?? 0;
        const pct = data.sum_other_doc_count
          ? Math.round((count / (count + data.sum_other_doc_count)) * 100)
          : '';
        result += `   ${i + 1}. ${bucket.key}: ${count.toLocaleString()} logs${pct ? ` (${pct}%)` : ''}\n`;
      }
      if (data.buckets.length > 10) {
        result += `   ... and ${data.buckets.length - 10} more values\n`;
      }
    } else if (typeof data.value === 'number') {
      result += `   Value: ${data.value.toLocaleString()}\n`;
    }
  }

  return result + '\n';
}

function getErrorRateSuggestion(response: {
  aggregations?: { by_level?: { buckets?: AggregationData['buckets'] } };
}): string | null {
  const levelBuckets = response.aggregations?.by_level?.buckets;
  if (!levelBuckets) return null;

  const errorBucket = levelBuckets.find(
    (b) => (b.key ?? '').toLowerCase() === 'error'
  );
  const totalLogs = levelBuckets.reduce(
    (sum, b) => sum + (b.doc_count ?? 0),
    0
  );

  if (!errorBucket || totalLogs === 0) return null;
  const pct = Math.round((errorBucket.doc_count! / totalLogs) * 100);
  if (pct <= 10) return null;
  return `⚠️  High error rate detected: ${pct}% of logs are errors`;
}

export function generateStatsSuggestions(response: {
  total?: number;
  aggregations?: { by_level?: { buckets?: AggregationData['buckets'] } };
}): string[] {
  const total = response.total ?? 0;
  if (total === 0) {
    return [
      '💡 No logs found. Try expanding the time range or checking your filters',
    ];
  }

  const suggestions: string[] = [];
  if (total < 10) {
    suggestions.push(
      '💡 Very few logs found. Consider expanding the time range for better insights'
    );
  }

  const errorSuggestion = getErrorRateSuggestion(response);
  if (errorSuggestion) suggestions.push(errorSuggestion);

  return suggestions;
}

export function buildStatsError(error: unknown): string {
  const msg = error instanceof Error ? error.message : 'Unknown error';
  let enhanced = `Failed to get log statistics: ${msg}`;

  if (msg.includes('timeout')) {
    enhanced +=
      '\n\n💡 **Suggestions:**\n' +
      '• Try a smaller time range (e.g., "1h" instead of "7d")\n' +
      '• Reduce the number of groupBy fields\n' +
      '• Use search_logs for individual log analysis';
  } else if (msg.includes('aggregation')) {
    enhanced +=
      '\n\n💡 **Suggestions:**\n' +
      '• Check that groupBy fields exist in your logs\n' +
      '• Common fields: level, k8s_namespace_name, service\n' +
      '• Use search_logs to explore available fields first';
  } else {
    enhanced +=
      '\n\n💡 **Alternatives:**\n' +
      '• Use search_logs for basic log analysis\n' +
      '• Try query_logs with aggregations for custom stats\n' +
      '• Check your API permissions and region settings';
  }

  return enhanced;
}
