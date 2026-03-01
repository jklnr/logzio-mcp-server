import { describe, expect, it } from 'vitest';
import {
  ApiError,
  RateLimitError,
  getRetryDelay,
  isRetryableError,
} from '../../src/utils/errors.js';

describe('isRetryableError', () => {
  it('returns true for 5xx ApiError', () => {
    const error = new ApiError('Service unavailable', 503);
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns false for 4xx ApiError that is not rate limit', () => {
    const error = new ApiError('Bad request', 400);
    expect(isRetryableError(error)).toBe(false);
  });

  it('returns true for RateLimitError', () => {
    const error = new RateLimitError('Rate limit exceeded', 1500);
    expect(isRetryableError(error)).toBe(true);
  });

  it('returns true for retryable network error messages', () => {
    expect(isRetryableError(new Error('socket hang up ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('request timeout exceeded'))).toBe(true);
  });

  it('returns false for unknown non-retryable errors', () => {
    expect(isRetryableError(new Error('validation failed'))).toBe(false);
    expect(isRetryableError('plain-string-error')).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('returns retryAfter for RateLimitError', () => {
    const error = new RateLimitError('Rate limit exceeded', 7000);
    expect(getRetryDelay(error)).toBe(7000);
  });

  it('returns undefined for non-rate-limit errors', () => {
    expect(
      getRetryDelay(new ApiError('Service unavailable', 503))
    ).toBeUndefined();
    expect(getRetryDelay(new Error('timeout'))).toBeUndefined();
  });
});
