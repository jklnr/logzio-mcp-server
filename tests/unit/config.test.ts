import { describe, expect, it } from 'vitest';
import { parseConfig } from '../../src/config.js';

describe('parseConfig', () => {
  it('uses env values and defaults when CLI values are missing', () => {
    process.env.LOGZIO_API_KEY = 'env-api-key';
    process.env.LOGZIO_REGION = 'eu';

    const config = parseConfig([]);

    expect(config.apiKey).toBe('env-api-key');
    expect(config.region).toBe('eu');
    expect(config.logzioUrl).toBe('https://api-eu.logz.io');
    expect(config.timeout).toBe(30000);
    expect(config.retryAttempts).toBe(3);
    expect(config.maxResults).toBe(1000);
  });

  it('applies CLI values over environment values', () => {
    process.env.LOGZIO_API_KEY = 'env-api-key';
    process.env.LOGZIO_REGION = 'us';
    process.env.LOGZIO_TIMEOUT = '15000';

    const config = parseConfig([
      'apiKey',
      'cli-api-key',
      'region',
      'ca',
      '--timeout',
      '5000',
      '--retry-attempts',
      '5',
      '--max-results',
      '250',
    ]);

    expect(config.apiKey).toBe('cli-api-key');
    expect(config.region).toBe('ca');
    expect(config.logzioUrl).toBe('https://api-ca.logz.io');
    expect(config.timeout).toBe(5000);
    expect(config.retryAttempts).toBe(5);
    expect(config.maxResults).toBe(250);
  });

  it('keeps custom logzioUrl instead of region-mapped URL', () => {
    const config = parseConfig([
      'apiKey',
      'cli-api-key',
      'region',
      'eu',
      'logzioUrl',
      'https://custom.logz.example',
    ]);

    expect(config.region).toBe('eu');
    expect(config.logzioUrl).toBe('https://custom.logz.example');
  });

  it('throws when apiKey is not provided by CLI or env', () => {
    expect(() => parseConfig([])).toThrow();
  });
});
