import pino from 'pino';

/**
 * Detect if we're running as an MCP server
 * MCP servers should not output human-readable logs to stdout as it interferes with the JSON protocol
 */
function isMcpMode(): boolean {
  // Check if we're being run directly (not as MCP server)
  const isDirectRun = process.argv.includes('--help') || process.argv.includes('-h');
  
  // Check if stdio is being used for MCP communication
  const isStdioMcp = !process.stdout.isTTY;
  
  return !isDirectRun && isStdioMcp;
}

/**
 * Configure the base logger instance
 */
function createLogger(): pino.Logger {
  const level = process.env.LOG_LEVEL?.toLowerCase() || 'info';
  const mcpMode = isMcpMode();
  
  if (mcpMode) {
    // In MCP mode, use minimal JSON logging to stderr only
    return pino({
      level: 'error', // Only log errors in MCP mode
    }, pino.destination({ dest: 2 })); // Log to stderr instead of stdout
  }
  
  // In normal mode, use pretty printing
  return pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
    base: {
      // Remove default fields we don't need
      pid: undefined,
      hostname: undefined,
    },
  });
}

/**
 * Base logger instance
 */
const baseLogger = createLogger();

/**
 * Get a child logger for a specific component
 */
export function getLogger(name: string): pino.Logger {
  return baseLogger.child({ component: name });
}

/**
 * Export the base logger for direct use
 */
export const logger = baseLogger; 