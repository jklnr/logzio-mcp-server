import { describe, expect, it } from 'vitest';
import { queryLogs } from '../../src/tools/query.js';
import { ValidationError } from '../../src/utils/errors.js';
import { defaultSearchResponse } from '../fixtures/searchResponse.js';
import { createMockApiClient } from '../helpers/mockApiClient.js';

describe('queryLogs tool integration', () => {
  it('builds Lucene payload with range and ascending sort', async () => {
    const client = createMockApiClient();
    client.queryLogs.mockResolvedValue(defaultSearchResponse);

    await queryLogs(client as unknown as LogzioApiClient, {
      luceneQuery: 'service:api',
      from: '2026-02-01T10:00:00.000Z',
      to: '2026-02-01T12:00:00.000Z',
      size: 25,
      sort: 'asc',
    });

    expect(client.queryLogs).toHaveBeenCalledWith({
      query: {
        bool: {
          must: [
            {
              query_string: {
                query: 'service:api',
              },
            },
          ],
          filter: {
            range: {
              '@timestamp': {
                gte: '2026-02-01T10:00:00.000Z',
                lte: '2026-02-01T12:00:00.000Z',
              },
            },
          },
        },
      },
      size: 25,
      sort: [{ '@timestamp': { order: 'asc' } }],
    });
  });

  it('returns formatted output for successful queries', async () => {
    const client = createMockApiClient();
    client.queryLogs.mockResolvedValue(defaultSearchResponse);

    const result = await queryLogs(client as unknown as LogzioApiClient, {
      luceneQuery: 'level:error',
      size: 100,
      sort: 'desc',
    });

    const contentText = result.content[0]?.text ?? '';
    expect(contentText).toContain('Lucene Query Results');
    expect(contentText).toContain('Found 2 total logs');
  });

  it('adds syntax help to parsing errors', async () => {
    const client = createMockApiClient();
    client.queryLogs.mockRejectedValue(
      new Error('parsing_exception: failed to parse query')
    );

    await expect(
      queryLogs(client as unknown as LogzioApiClient, {
        luceneQuery: 'level:ERROR AND (',
        size: 100,
        sort: 'desc',
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('Lucene Syntax Help'),
    });
  });

  it('throws ValidationError for invalid parameters', async () => {
    const client = createMockApiClient();

    await expect(
      queryLogs(client as unknown as LogzioApiClient, {
        luceneQuery: '',
        size: 100,
        sort: 'desc',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
