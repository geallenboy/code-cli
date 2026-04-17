/**
 * Provider 工厂单元测试
 *
 * 测试 AI 提供商工厂的核心逻辑：
 * - 默认模型名获取
 * - API Key 验证（缺失时抛出 ConfigurationError）
 * - 未知提供商处理
 * - createModel 集成（mock provider 适配器）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PROVIDER_CONFIG,
  getDefaultModel,
  getContextWindow,
  validateApiKey,
  createModel,
} from '../../src/provider.js';
import { ConfigurationError } from '../../src/errors.js';

describe('Provider Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Isolate environment variables per test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('PROVIDER_CONFIG', () => {
    it('should have configurations for all five providers', () => {
      expect(PROVIDER_CONFIG).toHaveProperty('anthropic');
      expect(PROVIDER_CONFIG).toHaveProperty('openai');
      expect(PROVIDER_CONFIG).toHaveProperty('google');
      expect(PROVIDER_CONFIG).toHaveProperty('deepseek');
      expect(PROVIDER_CONFIG).toHaveProperty('zhipu');
    });

    it('should have required fields for each provider', () => {
      for (const [name, config] of Object.entries(PROVIDER_CONFIG)) {
        expect(config.defaultModel, `${name}.defaultModel`).toBeTruthy();
        expect(config.apiKeyEnv, `${name}.apiKeyEnv`).toBeTruthy();
        expect(config.contextWindow, `${name}.contextWindow`).toBeGreaterThan(0);
      }
    });
  });

  describe('getDefaultModel', () => {
    it('should return the default model for anthropic', () => {
      expect(getDefaultModel('anthropic')).toBe('claude-sonnet-4-20250514');
    });

    it('should return the default model for openai', () => {
      expect(getDefaultModel('openai')).toBe('gpt-4o');
    });

    it('should return the default model for google', () => {
      expect(getDefaultModel('google')).toBe('gemini-2.5-flash');
    });

    it('should return the default model for deepseek', () => {
      expect(getDefaultModel('deepseek')).toBe('deepseek-chat');
    });

    it('should return the default model for zhipu', () => {
      expect(getDefaultModel('zhipu')).toBe('glm-4-plus');
    });

    it('should throw ConfigurationError for unknown provider', () => {
      expect(() => getDefaultModel('unknown')).toThrow(ConfigurationError);
      expect(() => getDefaultModel('unknown')).toThrow(/Unknown provider/);
    });
  });

  describe('getContextWindow', () => {
    it('should return 200k for anthropic', () => {
      expect(getContextWindow('anthropic')).toBe(200_000);
    });

    it('should return 128k for openai', () => {
      expect(getContextWindow('openai')).toBe(128_000);
    });

    it('should return 1M for google', () => {
      expect(getContextWindow('google')).toBe(1_000_000);
    });

    it('should return 64k for deepseek', () => {
      expect(getContextWindow('deepseek')).toBe(64_000);
    });

    it('should return 128k for zhipu', () => {
      expect(getContextWindow('zhipu')).toBe(128_000);
    });

    it('should throw ConfigurationError for unknown provider', () => {
      expect(() => getContextWindow('unknown')).toThrow(ConfigurationError);
    });
  });

  describe('validateApiKey', () => {
    it('should pass when ANTHROPIC_API_KEY is set', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-test-key';
      expect(() => validateApiKey('anthropic')).not.toThrow();
    });

    it('should pass when OPENAI_API_KEY is set', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';
      expect(() => validateApiKey('openai')).not.toThrow();
    });

    it('should pass when GOOGLE_GENERATIVE_AI_API_KEY is set', () => {
      process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = 'test-key';
      expect(() => validateApiKey('google')).not.toThrow();
    });

    it('should pass when DEEPSEEK_API_KEY is set', () => {
      process.env['DEEPSEEK_API_KEY'] = 'sk-test-key';
      expect(() => validateApiKey('deepseek')).not.toThrow();
    });

    it('should pass when ZHIPU_API_KEY is set', () => {
      process.env['ZHIPU_API_KEY'] = 'test-key';
      expect(() => validateApiKey('zhipu')).not.toThrow();
    });

    it('should throw ConfigurationError when API key is missing', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      expect(() => validateApiKey('anthropic')).toThrow(ConfigurationError);
      expect(() => validateApiKey('anthropic')).toThrow(/ANTHROPIC_API_KEY/);
    });

    it('should throw ConfigurationError when API key is empty string', () => {
      process.env['OPENAI_API_KEY'] = '';
      expect(() => validateApiKey('openai')).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError when API key is whitespace only', () => {
      process.env['ANTHROPIC_API_KEY'] = '   ';
      expect(() => validateApiKey('anthropic')).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for unknown provider', () => {
      expect(() => validateApiKey('unknown')).toThrow(ConfigurationError);
      expect(() => validateApiKey('unknown')).toThrow(/Unknown provider/);
    });

    it('should include the env var name in the error message', () => {
      delete process.env['OPENAI_API_KEY'];
      try {
        validateApiKey('openai');
      } catch (e) {
        expect((e as Error).message).toContain('OPENAI_API_KEY');
      }
    });
  });

  describe('createModel', () => {
    it('should throw ConfigurationError when API key is missing', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      expect(() => createModel('anthropic')).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for unknown provider', () => {
      expect(() => createModel('unknown')).toThrow(ConfigurationError);
    });

    it('should create a model instance when API key is set (anthropic)', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-test-key';
      const model = createModel('anthropic');
      expect(model).toBeDefined();
      expect(model.modelId).toContain('claude-sonnet-4-20250514');
    });

    it('should create a model with custom model name', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-test-key';
      const model = createModel('anthropic', 'claude-haiku-4-20250514');
      expect(model).toBeDefined();
      expect(model.modelId).toContain('claude-haiku-4-20250514');
    });

    it('should create an openai model instance', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';
      const model = createModel('openai');
      expect(model).toBeDefined();
      expect(model.modelId).toContain('gpt-4o');
    });

    it('should create a google model instance', () => {
      process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = 'test-key';
      const model = createModel('google');
      expect(model).toBeDefined();
      expect(model.modelId).toContain('gemini-2.5-flash');
    });

    it('should create a deepseek model instance', () => {
      process.env['DEEPSEEK_API_KEY'] = 'sk-test-key';
      const model = createModel('deepseek');
      expect(model).toBeDefined();
      expect(model.modelId).toContain('deepseek-chat');
    });

    it('should create a zhipu model instance', () => {
      process.env['ZHIPU_API_KEY'] = 'test-key';
      const model = createModel('zhipu');
      expect(model).toBeDefined();
      expect(model.modelId).toContain('glm-4-plus');
    });
  });
});
