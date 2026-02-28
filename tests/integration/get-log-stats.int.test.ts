import { describe, expect, it, vi } from 'vitest';
import { getLogStats } from '../../src/tools/stats.js';
import { defaultStatsResponse } from '../fixtures/statsResponse.js';
import { createMockApiClient } from '../helpers/mockApiClient.js';

describe('getLogStats tool integration', () => {
  it('defaults to 24h when from/to are missing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00.000Z'));

    const client = createMockApiClient();
    client.getLogStats.mockResolvedValue(defaultStatsResponse);

    const result = await getLogStats(client as unknown as LogzioApiClient, {});

    expect(client.getLogStats).toHaveBeenCalledWith({
      from: '2026-01-31T12:00:00.000Z',
      to: '2026-02-01T12:00:00.000Z',
    });
    const contentText = result.content[0]?.text ?? '';
    expect(contentText).toContain('Time range: 24h');
  });

  it('passes through explicit groupBy and custom from/to values', async () => {
    const client = createMockApiClient();
    client.getLogStats.mockResolvedValue(defaultStatsResponse);

    const result = await getLogStats(client as unknown as LogzioApiClient, {
      from: '2026-02-01T08:00:00.000Z',
      to: '2026-02-01T12:00:00.000Z',
      groupBy: ['service', 'k8s_namespace_name'],
    });

    expect(client.getLogStats).toHaveBeenCalledWith({
      from: '2026-02-01T08:00:00.000Z',
      to: '2026-02-01T12:00:00.000Z',
      groupBy: ['service', 'k8s_namespace_name'],
    });
    const contentText = result.content[0]?.text ?? '';
    expect(contentText).toContain('Grouped by: service, k8s_namespace_name');
  });

  it('shows no-data suggestion for empty statistics', async () => {
    const client = createMockApiClient();
    client.getLogStats.mockResolvedValue({
      total: 0,
      timeRange: {},
      buckets: [],
      aggregations: {},
    } as any);

    const result = await getLogStats(client as unknown as LogzioApiClient, {
      timeRange: '1h',
    });

    const contentText = result.content[0]?.text ?? '';
    expect(contentText).toContain(
      'No logs found. Try expanding the time range'
    );
  });

  it('shows high-error-rate warning when errors exceed 10%', async () => {
    const client = createMockApiClient();
    client.getLogStats.mockResolvedValue({
      total: 100,
      timeRange: {},
      buckets: [],
      aggregations: {
        by_level: {
          buckets: [
            { key: 'error', doc_count: 35 },
            { key: 'info', doc_count: 65 },
          ],
        },
      },
    } as any);

    const result = await getLogStats(client as unknown as LogzioApiClient, {
      timeRange: '24h',
    });

    const contentText = result.content[0]?.text ?? '';
    expect(contentText).toContain('High error rate detected: 35%');
  });
});
