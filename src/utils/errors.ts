/**
 * Base error class for MCP Logz.io server errors
 */
export abstract class LogzioError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    if (context) {
      this.context = context;
    }
    Error.captureStackTrace(this, this.constructor);
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
    };
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends LogzioError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', context);
  }
}

/**
 * API-related errors
 */
export class ApiError extends LogzioError {
  public readonly statusCode?: number;
  public readonly response?: unknown;

  constructor(
    message: string,
    statusCode?: number,
    response?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, 'API_ERROR', context);
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }
    if (response !== undefined) {
      this.response = response;
    }
  }

  public static fromResponse(
    response: { status: number; data?: unknown },
    context?: Record<string, unknown>
  ): ApiError {
    const message = getApiErrorMessage(response.status, response.data);
    return new ApiError(message, response.status, response.data, context);
  }
}

/**
 * Authentication-related errors
 */
export class AuthenticationError extends LogzioError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', context);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends LogzioError {
  public readonly retryAfter?: number;

  constructor(
    message: string,
    retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMIT_ERROR', context);
    if (retryAfter !== undefined) {
      this.retryAfter = retryAfter;
    }
  }
}

/**
 * Validation-related errors
 */
export class ValidationError extends LogzioError {
  public readonly field?: string;

  constructor(
    message: string,
    field?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', context);
    if (field !== undefined) {
      this.field = field;
    }
  }
}

/**
 * Tool execution errors
 */
export class ToolError extends LogzioError {
  public readonly toolName: string;

  constructor(
    message: string,
    toolName: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'TOOL_ERROR', { toolName, ...context });
    this.toolName = toolName;
  }
}

/**
 * Generate appropriate error message based on API response
 */
function getApiErrorMessage(statusCode: number, data?: unknown): string {
  switch (statusCode) {
    case 400:
      return 'Bad request: Please check your query parameters and format';
    case 401:
      return 'Unauthorized: Please check your API key';
    case 403:
      return 'Forbidden: You do not have permission to access this resource';
    case 404:
      return 'Not found: The requested resource was not found';
    case 429:
      return 'Rate limit exceeded: Please wait before making more requests';
    case 500:
      return 'Internal server error: Logz.io service is experiencing issues';
    case 502:
    case 503:
    case 504:
      return 'Service unavailable: Logz.io service is temporarily unavailable';
    default:
      return `API request failed with status ${statusCode}`;
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    // Retry on 5xx errors and rate limits
    return (
      (error.statusCode !== undefined && error.statusCode >= 500) ||
      error instanceof RateLimitError
    );
  }
  
  // Retry on network errors
  if (error instanceof Error) {
    return (
      error.message.includes('ECONNRESET') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('timeout')
    );
  }
  
  return false;
}

/**
 * Extract retry delay from error
 */
export function getRetryDelay(error: unknown): number | undefined {
  if (error instanceof RateLimitError) {
    return error.retryAfter;
  }
  return undefined;
} 