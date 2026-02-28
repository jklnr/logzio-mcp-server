import { describe, expect, it, vi } from 'vitest';
import { searchLogs } from '../../src/tools/search.js';
import { ValidationError } from '../../src/utils/errors.js';
import { defaultSearchResponse } from '../fixtures/searchResponse.js';
import { createMockApiClient } from '../helpers/mockApiClient.js';

describe('searchLogs tool integration', () => {
  it('quotes plain multi-word queries and defaults to 24h time range', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00.000Z'));

    const client = createMockApiClient();
    client.searchLogs.mockResolvedValue(defaultSearchResponse);

    const result = await searchLogs(client as any, {
      query: 'database connection timeout',
      limit: 50,
      sort: 'desc',
    });

    expect(client.searchLogs).toHaveBeenCalledWith({
      query: '"database connection timeout"',
      size: 50,
      sort: '@timestamp:desc',
      from: '2026-01-31T12:00:00.000Z',
      to: '2026-02-01T12:00:00.000Z',
    });
    const contentText = result.content[0]?.text ?? '';
    expect(contentText).toContain('Search Results');
    expect(contentText).toContain('[exact phrase]');
  });

  it('keeps Lucene-like queries unchanged and appends severity filter', async () => {
    const client = createMockApiClient();
    client.searchLogs.mockResolvedValue(defaultSearchResponse);

    await searchLogs(client as any, {
      query: 'level:error AND service:api',
      from: '2026-02-01T10:00:00.000Z',
      to: '2026-02-01T12:00:00.000Z',
      severity: 'warn',
      sort: 'asc',
      limit: 10,
    });

    expect(client.searchLogs).toHaveBeenCalledWith({
      query: 'level:error AND service:api AND level:warn',
      size: 10,
      sort: '@timestamp:asc',
      from: '2026-02-01T10:00:00.000Z',
      to: '2026-02-01T12:00:00.000Z',
    });
  });

  it('returns a no-results message when response has no hits', async () => {
    const client = createMockApiClient();
    client.searchLogs.mockResolvedValue({} as any);

    const result = await searchLogs(client as any, {
      query: 'this-will-not-match',
      limit: 50,
      sort: 'desc',
    });

    const contentText = result.content[0]?.text ?? '';
    expect(contentText).toContain(
      'No logs found matching the search criteria.'
    );
  });

  it('throws ValidationError for invalid input parameters', async () => {
    const client = createMockApiClient();

    await expect(
      searchLogs(client as any, {
        query: '',
        limit: 50,
        sort: 'desc',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
