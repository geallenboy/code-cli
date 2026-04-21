/**
 * 共享类型定义
 *
 * 定义整个项目中使用的核心类型、接口和常量。
 * 集中管理类型定义，确保各组件之间的类型一致性，避免循环导入。
 */

// ===== Agent 相关类型 =====

/** Agent 配置 */
export interface AgentConfig {
  /** AI 提供商 */
  provider: 'anthropic' | 'openai' | 'google' | 'deepseek' | 'zhipu';
  /** 模型名称 */
  model: string;
  /** 是否跳过确认 */
  yolo: boolean;
  /** 有效上下文窗口大小（tokens） */
  effectiveContextWindow: number;
}

/** Token 使用量追踪 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// ===== Provider 相关类型 =====

/** 提供商配置 */
export interface ProviderConfig {
  /** 默认模型名称 */
  defaultModel: string;
  /** API Key 环境变量名 */
  apiKeyEnv: string;
  /** 上下文窗口大小（tokens） */
  contextWindow: number;
}

// ===== 工具相关类型 =====

/** 工具执行结果 */
export interface ToolResult {
  /** 工具名称 */
  toolName: string;
  /** 执行结果文本 */
  content: string;
  /** 是否为错误 */
  isError: boolean;
}

// ===== 会话相关类型 =====

/** 会话数据 */
export interface SessionData {
  /** 会话唯一 ID */
  id: string;
  /** 开始时间 (ISO 8601) */
  startTime: string;
  /** 工作目录 */
  cwd: string;
  /** 消息历史 */
  messages: unknown[];
}

// ===== CLI 相关类型 =====

/** 命令行参数 */
export interface CliArgs {
  /** 一次性模式的提示词 */
  prompt?: string;
  /** AI 提供商 */
  provider: string;
  /** 模型名称 */
  model?: string;
  /** 跳过确认模式 */
  yolo: boolean;
  /** 恢复上次会话 */
  resume: boolean;
  /** 启用 MCP 工具加载 */
  mcp: boolean;
  /** 启用 Coordinator 模式 */
  coordinator: boolean;
  /** 启用 Swarm 模式 */
  swarm: boolean;
  /** Thinking budget（tokens） */
  thinkingBudget?: number;
  /** 禁用 thinking */
  noThinking: boolean;
  /** 启用 JSON 输出 */
  json: boolean;
}

// ===== 双层架构类型 (Phase 4) =====

/** query() generator yield 的事件类型 */
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; result: string }
  | { type: 'compact'; level: 'snip' | 'micro' | 'collapse' | 'auto'; tokensFreed: number }
  | { type: 'error'; error: Error; recoverable: boolean }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

/** query() generator 的返回类型 */
export interface Terminal {
  reason: 'complete' | 'aborted' | 'budget_exceeded' | 'max_turns' | 'error';
  lastAssistantText?: string;
}

/** Continue Site 转换原因 */
export type ContinueReason = 'next_turn' | 'ptl_recovery' | 'mot_escalation' | 'mot_continuation';

/** QueryEngine 配置 */
export interface QueryEngineConfig extends AgentConfig {
  maxTurns?: number;        // 默认 50
  maxBudgetUsd?: number;    // 默认无限制
}

// ===== 错误相关常量 =====

/** 可重试的 HTTP 状态码 */
export const RETRYABLE_STATUS_CODES = [429, 503, 529] as const;

/** 不可重试的 HTTP 状态码 */
export const NON_RETRYABLE_STATUS_CODES = [400, 401] as const;
