import { afterEach, beforeEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

beforeEach((): void => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach((): void => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  process.env = { ...ORIGINAL_ENV };
});
