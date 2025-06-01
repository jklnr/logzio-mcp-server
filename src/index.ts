#!/usr/bin/env node

import { parseConfig } from './config.js';
import { LogzioMcpServer } from './server.js';
import { getLogger } from './utils/logger.js';
import { ConfigurationError } from './utils/errors.js';

/**
 * Display usage information
 */
function showUsage(): void {
  console.log(`
MCP Server for Logz.io - Model Context Protocol Integration

USAGE:
  npx mcp-server-logzio apiKey <your-api-key>

ARGUMENTS:
  apiKey <key>        Your Logz.io API key (required)

OPTIONS:
  --timeout <ms>           Request timeout in milliseconds (default: 30000)
  --retry-attempts <num>   Number of retry attempts (default: 3)
  --max-results <num>      Maximum results per query (default: 1000)

ENVIRONMENT VARIABLES:
  LOGZIO_API_KEY          Alternative to apiKey argument
  LOGZIO_TIMEOUT          Alternative to --timeout option
  LOGZIO_RETRY_ATTEMPTS   Alternative to --retry-attempts option
  LOGZIO_MAX_RESULTS      Alternative to --max-results option
  LOG_LEVEL               Logging level (debug, info, warn, error)

EXAMPLES:
  npx mcp-server-logzio apiKey your-key

  export LOGZIO_API_KEY=your-key
  npx mcp-server-logzio

TOOLS PROVIDED:
  search_logs     - Search logs with simple queries and filters
  query_logs      - Execute advanced Lucene queries
  get_log_stats   - Retrieve log statistics and metrics
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const logger = getLogger('main');

  try {
    // Check for help flag
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      showUsage();
      process.exit(0);
    }

    // Parse configuration from CLI args and environment
    const args = process.argv.slice(2);
    const config = parseConfig(args);

    logger.info('Starting MCP server for Logz.io', {
      logzioUrl: config.logzioUrl,
      timeout: config.timeout,
      retryAttempts: config.retryAttempts,
      maxResults: config.maxResults,
    });

    // Create and start the server
    const server = new LogzioMcpServer(config);

    // Optional health check on startup
    try {
      await server.healthCheck();
      logger.info('Logz.io connectivity verified');
    } catch (error) {
      logger.warn('Initial health check failed, but continuing', error);
    }

    // Start the MCP server
    await server.start();

  } catch (error) {
    logger.error('Failed to start MCP server', error);

    if (error instanceof ConfigurationError) {
      console.error(`\nConfiguration Error: ${error.message}\n`);
      showUsage();
      process.exit(1);
    }

    console.error(`\nFatal Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const logger = getLogger('main');
  logger.error('Unhandled promise rejection', reason as Error, {
    promise: promise.toString(),
  });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  const logger = getLogger('main');
  logger.error('Uncaught exception', error);
  process.exit(1);
});

// Start the application
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Startup failed:', error);
    process.exit(1);
  });
} 