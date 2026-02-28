import { describe, expect, it, vi } from 'vitest';
import {
  TOOL_HANDLERS,
  executeTool,
  getToolNames,
  isValidTool,
} from '../../src/tools/index.js';
import { createMockApiClient } from '../helpers/mockApiClient.js';

describe('tool registry integration', () => {
  it('returns all expected tool names', () => {
    const toolNames = getToolNames();
    expect(toolNames).toEqual(['search_logs', 'query_logs', 'get_log_stats']);
  });

  it('reports valid and invalid tools correctly', () => {
    expect(isValidTool('search_logs')).toBe(true);
    expect(isValidTool('query_logs')).toBe(true);
    expect(isValidTool('get_log_stats')).toBe(true);
    expect(isValidTool('unknown_tool')).toBe(false);
  });

  it('throws for unknown tool execution requests', async () => {
    const client = createMockApiClient();
    await expect(
      executeTool('unknown_tool', client as any, {})
    ).rejects.toThrow('Unknown tool: unknown_tool');
  });

  it('dispatches to the mapped handler for known tools', async () => {
    const client = createMockApiClient();
    const mockResult = {
      content: [
        {
          type: 'text' as const,
          text: 'ok',
        },
      ],
    };
    const originalHandler = TOOL_HANDLERS.search_logs;
    if (!originalHandler) {
      throw new Error('search_logs handler is not defined');
    }
    const mockedHandler = vi.fn().mockResolvedValue(mockResult);

    TOOL_HANDLERS.search_logs = mockedHandler;

    try {
      const result = await executeTool('search_logs', client as any, {
        query: 'error',
      });

      expect(mockedHandler).toHaveBeenCalledWith(client, { query: 'error' });
      expect(result).toEqual(mockResult);
    } finally {
      TOOL_HANDLERS.search_logs = originalHandler;
    }
  });
});
