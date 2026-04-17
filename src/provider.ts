/**
 * AI 提供商工厂 (Provider Factory)
 *
 * 使用 Vercel AI SDK 的提供商适配器，根据配置创建对应的 LanguageModel 实例。
 * 支持 Anthropic、OpenAI、Google、DeepSeek、智谱(Zhipu) 五大提供商，
 * 通过统一接口屏蔽 API 差异。
 *
 * 学习点：Claude Code 使用专用的 Anthropic SDK，与模型深度绑定。
 * Mini 版通过 Vercel AI SDK 实现多提供商支持——一行代码切换模型，
 * 理解"统一抽象层"如何降低供应商锁定风险。
 *
 * DeepSeek 和智谱的接入展示了 AI SDK 的扩展性：
 * - DeepSeek: 官方 @ai-sdk/deepseek 包，一等公民支持
 * - 智谱: 通过 @ai-sdk/openai-compatible 接入（OpenAI 兼容 API）
 *
 * 参考 Claude Code: src/services/api/claude.ts (3,419 行)
 * 简化：Vercel AI SDK 统一多提供商接口，无需手动处理各家 API 差异
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { ProviderConfig } from './types.js';
import { ConfigurationError } from './errors.js';

/** 提供商配置映射 */
export const PROVIDER_CONFIG: Record<string, ProviderConfig> = {
  anthropic: {
    defaultModel: 'claude-sonnet-4-20250514',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    contextWindow: 200_000,
  },
  openai: {
    defaultModel: 'gpt-4o',
    apiKeyEnv: 'OPENAI_API_KEY',
    contextWindow: 128_000,
  },
  google: {
    defaultModel: 'gemini-2.5-flash',
    apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    contextWindow: 1_000_000,
  },
  deepseek: {
    defaultModel: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    contextWindow: 64_000,
  },
  zhipu: {
    defaultModel: 'glm-4-plus',
    apiKeyEnv: 'ZHIPU_API_KEY',
    contextWindow: 128_000,
  },
};

/**
 * 根据提供商名称和模型创建 LanguageModel 实例。
 *
 * Vercel AI SDK 的核心设计：每个提供商是一个工厂函数，
 * 传入模型名即可得到统一的 LanguageModel 接口。
 * 调用方无需关心底层是 Anthropic Messages API 还是 OpenAI Chat Completions API。
 *
 * @param provider - 提供商名称 ('anthropic' | 'openai' | 'google' | 'deepseek' | 'zhipu')
 * @param model - 模型名称（可选，使用提供商默认值）
 * @returns 统一的 LanguageModel 实例
 * @throws ConfigurationError 如果提供商未知或 API Key 未设置
 */
export function createModel(provider: string, model?: string): LanguageModel {
  validateApiKey(provider);

  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    throw new ConfigurationError(
      `Unknown provider: "${provider}". Supported providers: ${Object.keys(PROVIDER_CONFIG).join(', ')}`,
    );
  }

  const modelName = model ?? config.defaultModel;

  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic();
      return anthropic(modelName);
    }
    case 'openai': {
      const openai = createOpenAI();
      return openai(modelName);
    }
    case 'google': {
      const google = createGoogleGenerativeAI();
      return google(modelName);
    }
    case 'deepseek': {
      const deepseek = createDeepSeek();
      return deepseek(modelName);
    }
    case 'zhipu': {
      // 智谱 API 兼容 OpenAI 格式，使用 openai-compatible 适配器
      const zhipu = createOpenAICompatible({
        name: 'zhipu',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        headers: {
          Authorization: `Bearer ${process.env['ZHIPU_API_KEY'] ?? ''}`,
        },
      });
      return zhipu(modelName);
    }
    default:
      throw new ConfigurationError(
        `Unknown provider: "${provider}". Supported providers: ${Object.keys(PROVIDER_CONFIG).join(', ')}`,
      );
  }
}

/**
 * 获取提供商的默认模型名称
 * @param provider - 提供商名称
 * @returns 默认模型名称
 * @throws ConfigurationError 如果提供商未知
 */
export function getDefaultModel(provider: string): string {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    throw new ConfigurationError(
      `Unknown provider: "${provider}". Supported providers: ${Object.keys(PROVIDER_CONFIG).join(', ')}`,
    );
  }
  return config.defaultModel;
}

/**
 * 获取提供商的上下文窗口大小
 * @param provider - 提供商名称
 * @returns 上下文窗口大小（tokens）
 * @throws ConfigurationError 如果提供商未知
 */
export function getContextWindow(provider: string): number {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    throw new ConfigurationError(
      `Unknown provider: "${provider}". Supported providers: ${Object.keys(PROVIDER_CONFIG).join(', ')}`,
    );
  }
  return config.contextWindow;
}

/**
 * 验证指定提供商的 API Key 环境变量是否已设置。
 *
 * 这是启动时的"快速失败"检查——如果 API Key 缺失，
 * 立即给出清晰的错误信息，而不是等到第一次 API 调用时才报错。
 *
 * @param provider - 提供商名称
 * @throws ConfigurationError 如果 API Key 未设置
 */
export function validateApiKey(provider: string): void {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    throw new ConfigurationError(
      `Unknown provider: "${provider}". Supported providers: ${Object.keys(PROVIDER_CONFIG).join(', ')}`,
    );
  }

  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey || apiKey.trim() === '') {
    throw new ConfigurationError(
      `API key not set. Please set the ${config.apiKeyEnv} environment variable.\n` +
        `  export ${config.apiKeyEnv}=your-api-key-here`,
    );
  }
}
