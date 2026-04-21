/**
 * Extended Thinking + Structured Output 单元测试
 *
 * 测试：
 * - Thinking 配置和参数注入
 * - P34: 非 Anthropic 提供商静默忽略
 * - Thinking 显示格式化
 * - Thinking token 追踪
 * - Structured Output 验证
 * - JSON 提取
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  supportsThinking,
  modelSupportsThinking,
  createThinkingConfig,
  injectThinkingParams,
  extractThinkingContent,
  formatThinkingDisplay,
  createThinkingUsage,
  updateThinkingUsage,
  formatThinkingCost,
  DEFAULT_THINKING_BUDGET,
} from '../../src/thinking.js';
import {
  createStructuredOutputConfig,
  validateJsonOutput,
  validateWithSchema,
  extractJson,
} from '../../src/structured-output.js';

// ===== Thinking Tests =====

describe('Extended Thinking', () => {
  describe('supportsThinking', () => {
    it('should support anthropic', () => {
      expect(supportsThinking('anthropic')).toBe(true);
    });

    it('should not support openai', () => {
      expect(supportsThinking('openai')).toBe(false);
    });

    it('should not support deepseek', () => {
      expect(supportsThinking('deepseek')).toBe(false);
    });

    it('should not support google', () => {
      expect(supportsThinking('google')).toBe(false);
    });
  });

  describe('modelSupportsThinking', () => {
    it('should support claude-3 models', () => {
      expect(modelSupportsThinking('claude-3-opus-20240229')).toBe(true);
      expect(modelSupportsThinking('claude-3-sonnet-20240229')).toBe(true);
    });

    it('should support claude-sonnet models', () => {
      expect(modelSupportsThinking('claude-sonnet-4-20250514')).toBe(true);
    });

    it('should support claude-opus models', () => {
      expect(modelSupportsThinking('claude-opus-4-20250514')).toBe(true);
    });

    it('should not support non-claude models', () => {
      expect(modelSupportsThinking('gpt-4o')).toBe(false);
      expect(modelSupportsThinking('deepseek-chat')).toBe(false);
    });
  });

  describe('createThinkingConfig', () => {
    it('should enable thinking for anthropic + claude model', () => {
      const config = createThinkingConfig('anthropic', 'claude-3-opus-20240229');
      expect(config.enabled).toBe(true);
      expect(config.budget).toBe(DEFAULT_THINKING_BUDGET);
    });

    it('should use custom budget', () => {
      const config = createThinkingConfig('anthropic', 'claude-3-opus-20240229', 5000);
      expect(config.budget).toBe(5000);
    });

    it('P34: should silently ignore non-anthropic providers', () => {
      const config = createThinkingConfig('openai', 'gpt-4o');
      expect(config.enabled).toBe(false);
      expect(config.budget).toBe(0);
    });

    it('should disable when --no-thinking', () => {
      const config = createThinkingConfig('anthropic', 'claude-3-opus-20240229', 10000, true);
      expect(config.enabled).toBe(false);
    });

    it('should disable for unsupported models', () => {
      const config = createThinkingConfig('anthropic', 'some-other-model');
      expect(config.enabled).toBe(false);
    });
  });

  describe('injectThinkingParams', () => {
    it('should inject thinking params when enabled', () => {
      const config = createThinkingConfig('anthropic', 'claude-3-opus-20240229', 8000);
      const params = injectThinkingParams(config);
      expect(params).toHaveProperty('thinking');
      const thinking = params.thinking as Record<string, unknown>;
      expect(thinking.type).toBe('enabled');
      expect(thinking.budget_tokens).toBe(8000);
    });

    it('should return empty object when disabled', () => {
      const config = createThinkingConfig('openai', 'gpt-4o');
      const params = injectThinkingParams(config);
      expect(params).toEqual({});
    });
  });

  describe('extractThinkingContent', () => {
    it('should extract thinking from response', () => {
      const response = [
        { type: 'thinking', thinking: 'Let me analyze this...' },
        { type: 'text', text: 'Here is my answer.' },
      ];
      expect(extractThinkingContent(response)).toBe('Let me analyze this...');
    });

    it('should return null when no thinking', () => {
      const response = [{ type: 'text', text: 'Answer' }];
      expect(extractThinkingContent(response)).toBeNull();
    });
  });

  describe('formatThinkingDisplay', () => {
    it('should show collapsed format for multi-line thinking', () => {
      const thinking = 'First line\nSecond line\nThird line';
      const result = formatThinkingDisplay(thinking, true);
      expect(result).toContain('💭');
      expect(result).toContain('First line');
      expect(result).toContain('+2 lines');
    });

    it('should show full format when not collapsed', () => {
      const thinking = 'First line\nSecond line';
      const result = formatThinkingDisplay(thinking, false);
      expect(result).toContain('First line');
      expect(result).toContain('Second line');
    });

    it('should show single line without collapse indicator', () => {
      const result = formatThinkingDisplay('Single line', true);
      expect(result).toContain('Single line');
      expect(result).not.toContain('+');
    });
  });

  describe('thinking usage tracking', () => {
    it('should create empty usage', () => {
      const usage = createThinkingUsage();
      expect(usage.thinkingTokens).toBe(0);
      expect(usage.used).toBe(false);
    });

    it('should update usage', () => {
      let usage = createThinkingUsage();
      usage = updateThinkingUsage(usage, 500);
      expect(usage.thinkingTokens).toBe(500);
      expect(usage.used).toBe(true);
    });

    it('should accumulate tokens', () => {
      let usage = createThinkingUsage();
      usage = updateThinkingUsage(usage, 300);
      usage = updateThinkingUsage(usage, 200);
      expect(usage.thinkingTokens).toBe(500);
    });

    it('should format cost when not used', () => {
      const usage = createThinkingUsage();
      expect(formatThinkingCost(usage)).toContain('not used');
    });

    it('should format cost when used', () => {
      const usage = updateThinkingUsage(createThinkingUsage(), 1500);
      const result = formatThinkingCost(usage);
      expect(result).toContain('1,500');
      expect(result).toContain('tokens');
    });
  });
});

// ===== Structured Output Tests =====

describe('Structured Output', () => {
  describe('createStructuredOutputConfig', () => {
    it('should create enabled config with --json', () => {
      const config = createStructuredOutputConfig(true);
      expect(config.enabled).toBe(true);
    });

    it('should create disabled config without --json', () => {
      const config = createStructuredOutputConfig(false);
      expect(config.enabled).toBe(false);
    });

    it('should include schema when provided', () => {
      const schema = { type: 'object', properties: { name: { type: 'string' } } };
      const config = createStructuredOutputConfig(true, schema);
      expect(config.schema).toEqual(schema);
    });
  });

  describe('validateJsonOutput', () => {
    it('should validate valid JSON', () => {
      const result = validateJsonOutput('{"name": "test"}');
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('should reject invalid JSON', () => {
      const result = validateJsonOutput('not json');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate JSON arrays', () => {
      const result = validateJsonOutput('[1, 2, 3]');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateWithSchema', () => {
    it('should validate against Zod schema', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const result = validateWithSchema('{"name": "Alice", "age": 30}', schema);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'Alice', age: 30 });
    });

    it('should reject invalid schema match', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const result = validateWithSchema('{"name": "Alice"}', schema);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid JSON before schema check', () => {
      const schema = z.object({ name: z.string() });
      const result = validateWithSchema('not json', schema);
      expect(result.valid).toBe(false);
    });
  });

  describe('extractJson', () => {
    it('should extract plain JSON', () => {
      const result = extractJson('{"key": "value"}');
      expect(result).toBe('{"key": "value"}');
    });

    it('should extract JSON from markdown code block', () => {
      const input = 'Here is the result:\n```json\n{"key": "value"}\n```\nDone.';
      const result = extractJson(input);
      expect(result).toBe('{"key": "value"}');
    });

    it('should extract JSON from text with braces', () => {
      const input = 'The result is {"key": "value"} as expected.';
      const result = extractJson(input);
      expect(result).toBe('{"key": "value"}');
    });

    it('should return null for no JSON', () => {
      const result = extractJson('No JSON here');
      expect(result).toBeNull();
    });

    it('should handle nested JSON', () => {
      const json = '{"outer": {"inner": "value"}}';
      const result = extractJson(json);
      expect(result).toBe(json);
    });
  });
});
