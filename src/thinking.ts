/**
 * Extended Thinking 支持
 *
 * 为 Anthropic 提供商启用 Extended Thinking（思维链），
 * 让模型先推理再行动，提高复杂任务的成功率。
 *
 * 功能：
 * - thinking 参数注入（仅 Anthropic）
 * - --thinking-budget 配置（默认 10000 tokens）
 * - --no-thinking 禁用
 * - 非 Anthropic 提供商静默忽略（P34）
 * - thinking token 单独追踪
 *
 * 参考 Claude Code: Extended Thinking support
 */

/** Thinking 配置 */
export interface ThinkingConfig {
  /** 是否启用 thinking */
  enabled: boolean;
  /** thinking token 预算 */
  budget: number;
  /** AI 提供商 */
  provider: string;
}

/** Thinking token 追踪 */
export interface ThinkingUsage {
  /** thinking token 数量 */
  thinkingTokens: number;
  /** 是否使用了 thinking */
  used: boolean;
}

/** 支持 thinking 的提供商 */
const THINKING_PROVIDERS = ['anthropic'];

/** 支持 thinking 的模型前缀 */
const THINKING_MODEL_PREFIXES = ['claude-3', 'claude-sonnet', 'claude-opus'];

/** 默认 thinking budget */
export const DEFAULT_THINKING_BUDGET = 10000;

/**
 * 检查提供商是否支持 thinking
 *
 * @param provider - 提供商名称
 * @returns 是否支持
 */
export function supportsThinking(provider: string): boolean {
  return THINKING_PROVIDERS.includes(provider);
}

/**
 * 检查模型是否支持 thinking
 *
 * @param model - 模型名称
 * @returns 是否支持
 */
export function modelSupportsThinking(model: string): boolean {
  return THINKING_MODEL_PREFIXES.some(prefix => model.startsWith(prefix));
}

/**
 * 创建 thinking 配置
 *
 * @param provider - 提供商名称
 * @param model - 模型名称
 * @param budget - thinking budget（默认 10000）
 * @param disabled - 是否禁用（--no-thinking）
 * @returns thinking 配置
 */
export function createThinkingConfig(
  provider: string,
  model: string,
  budget = DEFAULT_THINKING_BUDGET,
  disabled = false,
): ThinkingConfig {
  // P34: 非 Anthropic 提供商静默忽略
  if (!supportsThinking(provider)) {
    return { enabled: false, budget: 0, provider };
  }

  // --no-thinking 禁用
  if (disabled) {
    return { enabled: false, budget: 0, provider };
  }

  // 检查模型是否支持
  if (!modelSupportsThinking(model)) {
    return { enabled: false, budget: 0, provider };
  }

  return { enabled: true, budget, provider };
}

/**
 * 注入 thinking 参数到 API 请求
 *
 * 仅在 Anthropic 提供商 + 支持的模型时注入。
 * 非 Anthropic 提供商静默忽略（P34）。
 *
 * @param config - thinking 配置
 * @returns API 请求的额外参数
 */
export function injectThinkingParams(
  config: ThinkingConfig,
): Record<string, unknown> {
  if (!config.enabled) return {};

  return {
    thinking: {
      type: 'enabled',
      budget_tokens: config.budget,
    },
  };
}

/**
 * 从 API 响应中提取 thinking 内容
 *
 * @param response - API 响应内容块
 * @returns thinking 文本，无则返回 null
 */
export function extractThinkingContent(
  response: Array<{ type: string; text?: string; thinking?: string }>,
): string | null {
  for (const block of response) {
    if (block.type === 'thinking' && block.thinking) {
      return block.thinking;
    }
  }
  return null;
}

/**
 * 格式化 thinking 显示
 *
 * 可折叠格式：首行可见，展开查看完整内容。
 *
 * @param thinking - thinking 文本
 * @param collapsed - 是否折叠（默认 true）
 * @returns 格式化的 thinking 文本
 */
export function formatThinkingDisplay(thinking: string, collapsed = true): string {
  const lines = thinking.split('\n');
  const firstLine = lines[0] ?? '';

  if (collapsed && lines.length > 1) {
    return `💭 ${firstLine} [+${lines.length - 1} lines]`;
  }

  return `💭 ${thinking}`;
}

/**
 * 创建 thinking usage 追踪器
 */
export function createThinkingUsage(): ThinkingUsage {
  return { thinkingTokens: 0, used: false };
}

/**
 * 更新 thinking usage
 *
 * @param usage - 当前 usage
 * @param tokens - 新增 thinking tokens
 * @returns 更新后的 usage
 */
export function updateThinkingUsage(
  usage: ThinkingUsage,
  tokens: number,
): ThinkingUsage {
  return {
    thinkingTokens: usage.thinkingTokens + tokens,
    used: true,
  };
}

/**
 * 格式化 thinking token 统计
 *
 * @param usage - thinking usage
 * @returns 格式化的统计文本
 */
export function formatThinkingCost(usage: ThinkingUsage): string {
  if (!usage.used) return 'Thinking: not used';
  return `Thinking: ${usage.thinkingTokens.toLocaleString()} tokens`;
}
