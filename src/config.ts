import { z } from 'zod';

/**
 * Supported Logz.io regions
 */
export const LOGZIO_REGIONS = {
  'us': 'https://api.logz.io',           // US East (default)
  'us-west': 'https://api-wa.logz.io',   // US West
  'eu': 'https://api-eu.logz.io',        // Europe
  'ca': 'https://api-ca.logz.io',        // Canada
  'au': 'https://api-au.logz.io',        // Australia
  'uk': 'https://api-uk.logz.io',        // United Kingdom
} as const;

export type LogzioRegion = keyof typeof LOGZIO_REGIONS;

/**
 * Configuration schema for the MCP Logz.io server
 */
export const ConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  region: z.enum(['us', 'us-west', 'eu', 'ca', 'au', 'uk'] as const).default('us').describe(
    'Logz.io region. Supported regions: us, us-west, eu, ca, au, uk'
  ),
  logzioUrl: z.string().url('logzioUrl must be a valid URL').optional().describe(
    'Custom Logz.io API URL. If provided, overrides the region setting'
  ),
  timeout: z.number().min(1000).max(60000).default(30000),
  retryAttempts: z.number().min(0).max(10).default(3),
  retryDelay: z.number().min(100).max(10000).default(1000),
  maxResults: z.number().min(1).max(10000).default(1000),
}).transform((data) => {
  // If logzioUrl is not provided, use the region to determine the URL
  if (!data.logzioUrl) {
    data.logzioUrl = LOGZIO_REGIONS[data.region];
  }
  return data;
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse configuration from command line arguments and environment variables
 * Priority: CLI args > env vars > defaults
 */
export function parseConfig(args: string[]): Config {
  const cliConfig = parseCliArgs(args);
  const envConfig = parseEnvVars();
  
  const rawConfig = {
    ...envConfig,
    ...cliConfig,
  };

  return ConfigSchema.parse(rawConfig);
}

/**
 * Parse command line arguments
 */
function parseCliArgs(args: string[]): Partial<Config> {
  const config: Partial<Config> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    
    switch (arg) {
      case 'apiKey':
        if (nextArg && !nextArg.startsWith('-')) {
          config.apiKey = nextArg;
          i++;
        }
        break;
      case 'region':
        if (nextArg && !nextArg.startsWith('-')) {
          config.region = nextArg as LogzioRegion;
          i++;
        }
        break;
      case 'logzioUrl':
        if (nextArg && !nextArg.startsWith('-')) {
          config.logzioUrl = nextArg;
          i++;
        }
        break;
      case '--timeout':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.timeout = Number(nextArg);
          i++;
        }
        break;
      case '--retry-attempts':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.retryAttempts = Number(nextArg);
          i++;
        }
        break;
      case '--max-results':
        if (nextArg && !isNaN(Number(nextArg))) {
          config.maxResults = Number(nextArg);
          i++;
        }
        break;
    }
  }
  
  return config;
}

/**
 * Parse environment variables
 */
function parseEnvVars(): Partial<Config> {
  const config: Partial<Config> = {};
  
  if (process.env.LOGZIO_API_KEY) {
    config.apiKey = process.env.LOGZIO_API_KEY;
  }
  
  if (process.env.LOGZIO_REGION) {
    config.region = process.env.LOGZIO_REGION as LogzioRegion;
  }
  
  if (process.env.LOGZIO_URL) {
    config.logzioUrl = process.env.LOGZIO_URL;
  }
  
  if (process.env.LOGZIO_TIMEOUT) {
    const timeout = Number(process.env.LOGZIO_TIMEOUT);
    if (!isNaN(timeout)) {
      config.timeout = timeout;
    }
  }
  
  if (process.env.LOGZIO_RETRY_ATTEMPTS) {
    const retryAttempts = Number(process.env.LOGZIO_RETRY_ATTEMPTS);
    if (!isNaN(retryAttempts)) {
      config.retryAttempts = retryAttempts;
    }
  }
  
  if (process.env.LOGZIO_MAX_RESULTS) {
    const maxResults = Number(process.env.LOGZIO_MAX_RESULTS);
    if (!isNaN(maxResults)) {
      config.maxResults = maxResults;
    }
  }
  
  return config;
} 