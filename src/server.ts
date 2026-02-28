import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import type { Config } from './config.js';
import { LogzioApiClient } from './api/client.js';
import { getLogger } from './utils/logger.js';
import { TOOLS, executeTool, isValidTool } from './tools/index.js';
import { ToolError, ConfigurationError } from './utils/errors.js';

/**
 * MCP server for Logz.io integration
 */
export class LogzioMcpServer {
  private readonly server: Server;
  private readonly client: LogzioApiClient;
  private readonly logger = getLogger('LogzioMcpServer');

  constructor(config: Config) {
    this.client = new LogzioApiClient(config);
    this.server = new Server({
      name: 'mcp-server-logzio',
      version: '0.1.0',
    }, {
      capabilities: {
        tools: {},
      },
    });

    this.setupHandlers();
    this.logger.info({
      logzioUrl: config.logzioUrl,
      toolCount: TOOLS.length,
    }, 'MCP server initialized');
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Listing available tools');
      return {
        tools: TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: args } = request.params;
      
      this.logger.info({
        toolName,
        hasArgs: Boolean(args),
      }, 'Tool call received');

      if (!isValidTool(toolName)) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${toolName}`
        );
      }

      try {
        const result = await executeTool(toolName, this.client, args || {});
        
        this.logger.info({
          toolName,
          contentLength: result.content[0]?.text?.length || 0,
        }, 'Tool call completed');

        return result;
      } catch (error) {
        this.logger.error({
          err: error,
          toolName,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        }, 'Tool call failed');

        if (error instanceof ToolError) {
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error.message}`,
            error.context
          );
        }

        if (error instanceof ConfigurationError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Configuration error: ${error.message}`,
            error.context
          );
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Start the MCP server
   */
  public async start(): Promise<void> {
    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    this.logger.info('MCP server started and ready for connections');
    
    // Handle process signals for graceful shutdown
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
  }

  /**
   * Shutdown the server gracefully
   */
  private async shutdown(signal: string): Promise<void> {
    this.logger.info({ signal }, 'Shutting down MCP server');
    
    try {
      await this.server.close();
      this.logger.info('MCP server shutdown complete');
      process.exit(0);
    } catch (error) {
      this.logger.error(error as Error, 'Error during shutdown');
      process.exit(1);
    }
  }

  /**
   * Health check - test connection to Logz.io
   */
  public async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      return await this.client.healthCheck();
    } catch (error) {
      this.logger.error(error as Error, 'Health check failed');
      throw error;
    }
  }
} 