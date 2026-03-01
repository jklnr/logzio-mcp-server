import { buildLuceneQuery } from '../api/endpoints.js';
import type { SearchResponse } from '../api/types.js';
import { formatLogEntry } from '../utils/logs.js';

export function buildQueryPayload(validatedParams: {
  luceneQuery: string;
  size: number;
  sort: 'asc' | 'desc';
  from?: string | undefined;
  to?: string | undefined;
}): Record<string, unknown> {
  return buildLuceneQuery({
    query: validatedParams.luceneQuery,
    size: validatedParams.size,
    sort:
      validatedParams.sort === 'desc'
        ? [{ '@timestamp': { order: 'desc' } }]
        : [{ '@timestamp': { order: 'asc' } }],
    ...(validatedParams.from && { from: validatedParams.from }),
    ...(validatedParams.to && { to: validatedParams.to }),
  });
}

export function formatQueryResult(
  response: SearchResponse,
  validatedParams: {
    luceneQuery: string;
    from?: string | undefined;
    to?: string | undefined;
  },
  queryAnalysis: {
    complexity: string;
    suggestions: string[];
    warnings: string[];
  },
  queryDuration: number
): { content: Array<{ type: 'text'; text: string }> } {
  const logs = response.hits.hits;
  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : (response.hits.total as { value?: number })?.value || 0;

  const formattedLogs = logs.map((hit, index) =>
    formatLogEntry(hit._source, index)
  );

  const warningText =
    queryAnalysis.warnings.length > 0
      ? queryAnalysis.warnings.join('\n') + '\n'
      : '';
  const suggestionText =
    queryAnalysis.suggestions.length > 0
      ? queryAnalysis.suggestions.join('\n') + '\n'
      : '';

  const summary = `🔍 **Lucene Query Results**
📊 Found ${total.toLocaleString()} total logs (showing top ${logs.length})
⏱️  Query completed in ${queryDuration}ms
🧮 Query complexity: ${queryAnalysis.complexity}
🔎 Lucene query: \`${validatedParams.luceneQuery}\`
📅 Time range: ${validatedParams.from || 'N/A'} to ${validatedParams.to || 'N/A'}

${warningText}${suggestionText}`;

  return {
    content: [
      {
        type: 'text',
        text:
          summary +
          '\n\n📝 **Log Entries**\n\n' +
          formattedLogs.join('\n\n---\n\n'),
      },
    ],
  };
}

export function buildQueryError(error: unknown): string {
  const msg = error instanceof Error ? error.message : 'Unknown error';
  let enhanced = `Failed to execute Lucene query: ${msg}`;
  if (msg.includes('parsing_exception') || msg.includes('syntax')) {
    enhanced +=
      '\n\n🔧 **Lucene Syntax Help:**\n' +
      '• Field searches: level:ERROR, host:web*\n' +
      '• Boolean: (ERROR OR WARN) AND service:api\n' +
      '• Ranges: timestamp:[2024-01-01 TO 2024-01-31]\n' +
      '• Exclusions: level:ERROR AND NOT k8s_namespace_name:monitoring\n\n' +
      '💡 Try using the search_logs tool for simpler text searches.';
  }
  return enhanced;
}
