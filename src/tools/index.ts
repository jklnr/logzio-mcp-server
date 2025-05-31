import type { LogzioApiClient } from '../api/client.js';
import { searchLogs, searchLogsTool, type SearchLogsParams } from './search.js';
import { queryLogs, queryLogsTool, type QueryLogsParams } from './query.js';
import { getLogStats, logStatsTool, type LogStatsParams } from './stats.js';

/**
 * All available MCP tools
 */
export const TOOLS = [
  searchLogsTool,
  queryLogsTool,
  logStatsTool,
] as const;

/**
 * Tool parameter types
 */
export type ToolParams = 
  | SearchLogsParams
  | QueryLogsParams 
  | LogStatsParams;

/**
 * Tool result type
 */
export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
};

/**
 * Tool handler function type
 */
export type ToolHandler = (
  client: LogzioApiClient,
  params: unknown
) => Promise<ToolResult>;

/**
 * Tool registry mapping tool names to handlers
 */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  search_logs: (client, params) => searchLogs(client, params as SearchLogsParams),
  query_logs: (client, params) => queryLogs(client, params as QueryLogsParams),
  get_log_stats: (client, params) => getLogStats(client, params as LogStatsParams),
};

/**
 * Execute a tool by name with parameters
 */
export async function executeTool(
  toolName: string,
  client: LogzioApiClient,
  params: unknown
): Promise<ToolResult> {
  const handler = TOOL_HANDLERS[toolName];
  
  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  
  return handler(client, params);
}

/**
 * Get all available tool names
 */
export function getToolNames(): string[] {
  return Object.keys(TOOL_HANDLERS);
}

/**
 * Check if a tool exists
 */
export function isValidTool(toolName: string): boolean {
  return toolName in TOOL_HANDLERS;
}

// Re-export individual tools for convenience
export {
  searchLogs,
  searchLogsTool,
  type SearchLogsParams,
} from './search.js';

export {
  queryLogs,
  queryLogsTool,
  type QueryLogsParams,
} from './query.js';

export {
  getLogStats,
  logStatsTool,
  type LogStatsParams,
} from './stats.js'; 