import { describe, expect, it, vi } from 'vitest';
import { buildLuceneQuery, parseTimeRange } from '../../src/api/endpoints.js';

describe('buildLuceneQuery', () => {
  it('builds a query_string payload with default descending sort', () => {
    const payload = buildLuceneQuery({
      query: 'level:error',
    });

    expect(payload.query).toEqual({
      query_string: {
        query: 'level:error',
      },
    });
    expect(payload.sort).toEqual([{ '@timestamp': { order: 'desc' } }]);
  });

  it('builds bool+range query payload when from and to are provided', () => {
    const payload = buildLuceneQuery({
      query: 'service:api',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T02:00:00.000Z',
      size: 42,
      sort: [{ '@timestamp': { order: 'asc' } }],
    });

    expect(payload.size).toBe(42);
    expect(payload.sort).toEqual([{ '@timestamp': { order: 'asc' } }]);
    expect(payload.query).toEqual({
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
              gte: '2026-01-01T00:00:00.000Z',
              lte: '2026-01-01T02:00:00.000Z',
            },
          },
        },
      },
    });
  });
});

describe('parseTimeRange', () => {
  it('returns expected ISO range for 1h', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

    const range = parseTimeRange('1h');

    expect(range).toEqual({
      from: '2026-01-01T11:00:00.000Z',
      to: '2026-01-01T12:00:00.000Z',
    });
  });

  it('returns expected ISO range for 7d', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-08T12:00:00.000Z'));

    const range = parseTimeRange('7d');

    expect(range).toEqual({
      from: '2026-01-01T12:00:00.000Z',
      to: '2026-01-08T12:00:00.000Z',
    });
  });

  it('returns empty range for invalid input', () => {
    expect(parseTimeRange('invalid')).toEqual({});
  });
});
