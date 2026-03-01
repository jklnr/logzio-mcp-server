import type { SearchResponse } from '../api/types.js';

type SearchParams = {
  query: string;
  timeRange?: string;
  from?: string;
  to?: string;
  severity?: string;
  logType?: string;
};
import { formatLogEntry } from '../utils/logs.js';

const LUCENE_INDICATORS = ['"', ':', ' AND ', ' OR ', ' NOT ', '*', '?'];

function hasLuceneSyntax(query: string): boolean {
  return LUCENE_INDICATORS.some((ind) => query.includes(ind));
}

function isMultiWordPhrase(query: string): boolean {
  const words = query.trim().split(/\s+/);
  if (words.length <= 1) return false;
  const hasSpecialChars =
    query.includes('-') || query.includes('_') || query.includes('.');
  return (
    words.length <= 6 &&
    (hasSpecialChars || words.some((word) => word.length > 3))
  );
}

/**
 * Detect if a query should be treated as an exact phrase and format it accordingly
 */
export function smartPhraseDetection(query: string): string {
  if (hasLuceneSyntax(query)) return query;
  if (isMultiWordPhrase(query)) return `"${query}"`;
  return query;
}

export function generateQuerySuggestions(
  query: string,
  params: SearchParams
): string[] {
  const suggestions: string[] = [];

  if (!params.timeRange && !params.from && !params.to) {
    suggestions.push(
      '💡 Tip: Add timeRange="1h" for recent issues or "24h" for broader analysis'
    );
  }

  if (!params.severity && query.toLowerCase().includes('error')) {
    suggestions.push(
      '💡 Tip: Add severity="error" to focus on critical issues'
    );
  }

  if (query && !query.includes('"') && query.split(/\s+/).length > 1) {
    suggestions.push(
      '💡 Search precision: Multi-word queries are automatically treated as exact phrases. Use individual words for broader matching.'
    );
  }

  return suggestions;
}

export function formatSearchResult(
  response: SearchResponse,
  opts: {
    params: SearchParams;
    from: string | undefined;
    to: string | undefined;
    duration: number;
    wasQuoted: boolean;
  }
): { content: Array<{ type: 'text'; text: string }> } {
  const { params, from, to, duration, wasQuoted } = opts;
  const logs = response.hits.hits;
  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : (response.hits.total as { value?: number })?.value || 0;

  const formattedLogs = logs.map((hit, index) =>
    formatLogEntry(hit._source, index)
  );

  const suggestions = generateQuerySuggestions(params.query, params);
  const suggestionText =
    suggestions.length > 0 ? '\n\n' + suggestions.join('\n') : '';

  const summary = `🔍 **Search Results**
📊 Found ${total.toLocaleString()} total logs (showing top ${logs.length})
⏱️  Search completed in ${duration}ms
🔎 Query: "${params.query}"${wasQuoted ? ' [exact phrase]' : ''}
📅 Time range: ${from || 'N/A'} to ${to || 'N/A'}
${params.severity ? `📈 Severity: ${params.severity}` : ''}
${params.logType ? `🏷️  Log type: ${params.logType}` : ''}

${suggestionText}`;

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
