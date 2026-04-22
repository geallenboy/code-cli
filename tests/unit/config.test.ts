/**
 * Config 模块单元测试
 *
 * 测试配置管理的核心逻辑：
 * - loadConfig / saveConfig 文件读写
 * - applyConfig 环境变量设置
 * - hasAnyApiKey 检测
 * - formatConfigInfo 格式化输出
 * - getMissingKeyMessage 帮助信息
 * - parseArgs --setup 标志
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConfig,
  saveConfig,
  applyConfig,
  hasAnyApiKey,
  formatConfigInfo,
  getMissingKeyMessage,
  getConfigPath,
  getConfigDir,
} from '../../src/config.js';
import type { CodeCliConfig } from '../../src/config.js';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock os.homedir
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock-home'),
}));

describe('Config Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getConfigPath / getConfigDir', () => {
    it('should return paths under ~/.code-cli', () => {
      expect(getConfigDir()).toBe(join('/mock-home', '.code-cli'));
      expect(getConfigPath()).toBe(join('/mock-home', '.code-cli', 'config.json'));
    });
  });

  describe('loadConfig', () => {
    it('should return empty object when config file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const config = loadConfig();
      expect(config).toEqual({});
    });

    it('should parse and return config when file exists', () => {
      const mockConfig: CodeCliConfig = {
        defaultProvider: 'openai',
        apiKeys: { openai: 'sk-test-key' },
      };
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const config = loadConfig();
      expect(config).toEqual(mockConfig);
    });

    it('should return empty object when file contains invalid JSON', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not valid json');

      const config = loadConfig();
      expect(config).toEqual({});
    });

    it('should return empty object when readFileSync throws', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('permission denied');
      });

      const config = loadConfig();
      expect(config).toEqual({});
    });
  });

  describe('saveConfig', () => {
    it('should create config directory if it does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config: CodeCliConfig = { defaultProvider: 'anthropic' };
      saveConfig(config);

      expect(mkdirSync).toHaveBeenCalledWith(
        join('/mock-home', '.code-cli'),
        { recursive: true },
      );
    });

    it('should not create directory if it already exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const config: CodeCliConfig = { defaultProvider: 'anthropic' };
      saveConfig(config);

      expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('should write config as formatted JSON', () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const config: CodeCliConfig = {
        defaultProvider: 'openai',
        apiKeys: { openai: 'sk-test' },
      };
      saveConfig(config);

      expect(writeFileSync).toHaveBeenCalledWith(
        join('/mock-home', '.code-cli', 'config.json'),
        JSON.stringify(config, null, 2) + '\n',
        'utf-8',
      );
    });
  });

  describe('applyConfig', () => {
    it('should set environment variables from config apiKeys', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['OPENAI_API_KEY'];

      const config: CodeCliConfig = {
        apiKeys: {
          anthropic: 'sk-ant-test',
          openai: 'sk-oai-test',
        },
      };

      applyConfig(config);

      expect(process.env['ANTHROPIC_API_KEY']).toBe('sk-ant-test');
      expect(process.env['OPENAI_API_KEY']).toBe('sk-oai-test');
    });

    it('should not override existing environment variables', () => {
      process.env['ANTHROPIC_API_KEY'] = 'existing-key';

      const config: CodeCliConfig = {
        apiKeys: {
          anthropic: 'config-key',
        },
      };

      applyConfig(config);

      expect(process.env['ANTHROPIC_API_KEY']).toBe('existing-key');
    });

    it('should override empty environment variables', () => {
      process.env['ANTHROPIC_API_KEY'] = '';

      const config: CodeCliConfig = {
        apiKeys: {
          anthropic: 'config-key',
        },
      };

      applyConfig(config);

      expect(process.env['ANTHROPIC_API_KEY']).toBe('config-key');
    });

    it('should override whitespace-only environment variables', () => {
      process.env['ANTHROPIC_API_KEY'] = '   ';

      const config: CodeCliConfig = {
        apiKeys: {
          anthropic: 'config-key',
        },
      };

      applyConfig(config);

      expect(process.env['ANTHROPIC_API_KEY']).toBe('config-key');
    });

    it('should do nothing when config has no apiKeys', () => {
      const originalKey = process.env['ANTHROPIC_API_KEY'];
      const config: CodeCliConfig = {};

      applyConfig(config);

      expect(process.env['ANTHROPIC_API_KEY']).toBe(originalKey);
    });

    it('should skip unknown providers in apiKeys', () => {
      const config: CodeCliConfig = {
        apiKeys: {
          unknown_provider: 'some-key',
        },
      };

      // Should not throw
      applyConfig(config);
    });

    it('should handle all five providers', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
      delete process.env['DEEPSEEK_API_KEY'];
      delete process.env['ZHIPU_API_KEY'];

      const config: CodeCliConfig = {
        apiKeys: {
          anthropic: 'key-ant',
          openai: 'key-oai',
          google: 'key-goo',
          deepseek: 'key-ds',
          zhipu: 'key-zp',
        },
      };

      applyConfig(config);

      expect(process.env['ANTHROPIC_API_KEY']).toBe('key-ant');
      expect(process.env['OPENAI_API_KEY']).toBe('key-oai');
      expect(process.env['GOOGLE_GENERATIVE_AI_API_KEY']).toBe('key-goo');
      expect(process.env['DEEPSEEK_API_KEY']).toBe('key-ds');
      expect(process.env['ZHIPU_API_KEY']).toBe('key-zp');
    });
  });

  describe('hasAnyApiKey', () => {
    it('should return true when env var is set', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-test';
      // Mock loadConfig to return empty
      vi.mocked(existsSync).mockReturnValue(false);

      expect(hasAnyApiKey()).toBe(true);
    });

    it('should return true when config file has a key', () => {
      // Clear all env vars
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
      delete process.env['DEEPSEEK_API_KEY'];
      delete process.env['ZHIPU_API_KEY'];

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ apiKeys: { openai: 'sk-from-config' } }),
      );

      expect(hasAnyApiKey()).toBe(true);
    });

    it('should return false when no keys are available', () => {
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
      delete process.env['DEEPSEEK_API_KEY'];
      delete process.env['ZHIPU_API_KEY'];

      vi.mocked(existsSync).mockReturnValue(false);

      expect(hasAnyApiKey()).toBe(false);
    });

    it('should return false when env var is empty string', () => {
      process.env['ANTHROPIC_API_KEY'] = '';
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
      delete process.env['DEEPSEEK_API_KEY'];
      delete process.env['ZHIPU_API_KEY'];

      vi.mocked(existsSync).mockReturnValue(false);

      expect(hasAnyApiKey()).toBe(false);
    });
  });

  describe('formatConfigInfo', () => {
    it('should include current provider and model', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const lines = formatConfigInfo('anthropic', 'claude-sonnet-4-20250514');
      const text = lines.join('\n');

      expect(text).toContain('anthropic');
      expect(text).toContain('claude-sonnet-4-20250514');
    });

    it('should show API key status for each provider', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-test';
      delete process.env['OPENAI_API_KEY'];

      vi.mocked(existsSync).mockReturnValue(false);

      const lines = formatConfigInfo('anthropic', 'claude-sonnet-4-20250514');
      const text = lines.join('\n');

      expect(text).toContain('Anthropic');
      expect(text).toContain('OpenAI');
    });

    it('should suggest --setup command', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const lines = formatConfigInfo('anthropic', 'default');
      const text = lines.join('\n');

      expect(text).toContain('--setup');
    });
  });

  describe('getMissingKeyMessage', () => {
    it('should include the env var name for the provider', () => {
      const msg = getMissingKeyMessage('anthropic');
      expect(msg).toContain('ANTHROPIC_API_KEY');
    });

    it('should suggest code-cli --setup', () => {
      const msg = getMissingKeyMessage('openai');
      expect(msg).toContain('code-cli --setup');
    });

    it('should suggest environment variable export', () => {
      const msg = getMissingKeyMessage('google');
      expect(msg).toContain('export GOOGLE_GENERATIVE_AI_API_KEY');
    });

    it('should suggest .env file', () => {
      const msg = getMissingKeyMessage('deepseek');
      expect(msg).toContain('.env');
    });

    it('should handle unknown provider gracefully', () => {
      const msg = getMissingKeyMessage('unknown');
      expect(msg).toContain('code-cli --setup');
    });
  });
});

describe('parseArgs --setup', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  function setArgs(...args: string[]): void {
    process.argv = ['node', 'index.js', ...args];
  }

  it('should parse --setup flag', async () => {
    setArgs('--setup');
    const { parseArgs } = await import('../../src/cli.js');
    const result = parseArgs();
    expect(result.setup).toBe(true);
  });

  it('should parse config positional argument', async () => {
    setArgs('config');
    const { parseArgs } = await import('../../src/cli.js');
    const result = parseArgs();
    expect(result.setup).toBe(true);
  });

  it('should default setup to false', async () => {
    setArgs();
    const { parseArgs } = await import('../../src/cli.js');
    const result = parseArgs();
    expect(result.setup).toBe(false);
  });
});
