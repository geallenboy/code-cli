/**
 * AI 提供商工厂
 *
 * 使用 Vercel AI SDK 的提供商适配器，根据配置创建
 * 对应的 LanguageModel 实例。支持 Anthropic、OpenAI、Google 三大提供商。
 *
 * 参考 Claude Code: 专用 Anthropic SDK
 * 简化：Vercel AI SDK 统一多提供商接口
 */

import type { ProviderConfig } from './types.js';

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
};

/**
 * 根据提供商名称和模型创建 LanguageModel 实例
 * @param _provider - 提供商名称
 * @param _model - 模型名称（可选，使用默认值）
 * @returns LanguageModel 实例
 */
export function createModel(_provider: string, _model?: string): unknown {
  // TODO: Phase 1 — 实现 provider 工厂
  throw new Error('Not implemented');
}

/**
 * 获取提供商的默认模型名称
 * @param provider - 提供商名称
 * @returns 默认模型名称
 */
export function getDefaultModel(provider: string): string {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return config.defaultModel;
}

/**
 * 验证 API Key 环境变量是否已设置
 * @param _provider - 提供商名称
 * @throws ConfigurationError 如果 API Key 未设置
 */
export function validateApiKey(_provider: string): void {
  // TODO: Phase 1 — 实现 API Key 验证
  throw new Error('Not implemented');
}
