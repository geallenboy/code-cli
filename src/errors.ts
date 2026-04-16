/**
 * Custom error class hierarchy for Mini Claude Code.
 *
 * Design philosophy: "Errors are data, not exceptions."
 * Tool execution errors are converted to tool results and fed back to the model,
 * allowing it to self-correct. Only configuration and unrecoverable errors
 * cause program termination.
 *
 * Reference: Claude Code uses typed errors throughout its 512K+ line codebase
 * to enable precise error handling at each layer.
 */

/** Error thrown when a tool fails during execution */
export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly cause: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

/** Error thrown when API communication fails */
export class ApiCommunicationError extends Error {
  constructor(
    public readonly statusCode: number | undefined,
    public readonly isRetryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'ApiCommunicationError';
  }
}

/** Error thrown when configuration is invalid (e.g., missing API key) */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
