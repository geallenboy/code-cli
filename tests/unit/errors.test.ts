import { describe, it, expect } from 'vitest';
import { ToolExecutionError, ApiCommunicationError, ConfigurationError } from '../../src/errors.js';

describe('Custom Error Classes', () => {
  describe('ToolExecutionError', () => {
    it('should store toolName and cause', () => {
      const cause = new Error('file not found');
      const err = new ToolExecutionError('read_file', cause, 'Failed to read');
      expect(err.toolName).toBe('read_file');
      expect(err.cause).toBe(cause);
      expect(err.message).toBe('Failed to read');
      expect(err.name).toBe('ToolExecutionError');
      expect(err instanceof Error).toBe(true);
    });
  });

  describe('ApiCommunicationError', () => {
    it('should store statusCode and isRetryable', () => {
      const err = new ApiCommunicationError(429, true, 'Rate limited');
      expect(err.statusCode).toBe(429);
      expect(err.isRetryable).toBe(true);
      expect(err.message).toBe('Rate limited');
      expect(err.name).toBe('ApiCommunicationError');
    });

    it('should handle undefined statusCode', () => {
      const err = new ApiCommunicationError(undefined, false, 'Network error');
      expect(err.statusCode).toBeUndefined();
      expect(err.isRetryable).toBe(false);
    });
  });

  describe('ConfigurationError', () => {
    it('should store message', () => {
      const err = new ConfigurationError('API key missing');
      expect(err.message).toBe('API key missing');
      expect(err.name).toBe('ConfigurationError');
      expect(err instanceof Error).toBe(true);
    });
  });
});
