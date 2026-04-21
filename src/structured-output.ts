/**
 * Structured Output 支持
 *
 * 支持 --json 标志请求结构化 JSON 输出。
 * 传递 JSON Schema 给 API 强制输出格式。
 * 响应验证。
 *
 * 参考 Claude Code: Structured output support
 */

import { z } from 'zod';

/** Structured Output 配置 */
export interface StructuredOutputConfig {
  /** 是否启用 JSON 输出 */
  enabled: boolean;
  /** JSON Schema（可选） */
  schema?: Record<string, unknown>;
}

/**
 * 创建 structured output 配置
 *
 * @param jsonFlag - --json 标志
 * @param schema - 可选的 JSON Schema
 * @returns 配置
 */
export function createStructuredOutputConfig(
  jsonFlag: boolean,
  schema?: Record<string, unknown>,
): StructuredOutputConfig {
  return {
    enabled: jsonFlag,
    schema,
  };
}

/**
 * 验证 JSON 输出
 *
 * @param output - 模型输出文本
 * @returns 解析结果
 */
export function validateJsonOutput(output: string): {
  valid: boolean;
  data?: unknown;
  error?: string;
} {
  try {
    const data = JSON.parse(output) as unknown;
    return { valid: true, data };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid JSON',
    };
  }
}

/**
 * 使用 Zod schema 验证 JSON 输出
 *
 * @param output - 模型输出文本
 * @param schema - Zod schema
 * @returns 验证结果
 */
export function validateWithSchema<T>(
  output: string,
  schema: z.ZodType<T>,
): { valid: boolean; data?: T; error?: string } {
  const jsonResult = validateJsonOutput(output);
  if (!jsonResult.valid) {
    return { valid: false, error: jsonResult.error };
  }

  const result = schema.safeParse(jsonResult.data);
  if (result.success) {
    return { valid: true, data: result.data };
  }

  return {
    valid: false,
    error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}

/**
 * 从模型输出中提取 JSON
 *
 * 尝试从文本中提取 JSON 块（可能被 markdown 代码块包裹）。
 *
 * @param output - 模型输出文本
 * @returns 提取的 JSON 字符串，失败返回 null
 */
export function extractJson(output: string): string | null {
  // 尝试直接解析
  try {
    JSON.parse(output);
    return output;
  } catch {
    // 继续尝试提取
  }

  // 尝试从 markdown 代码块中提取
  const codeBlockMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch?.[1]) {
    try {
      JSON.parse(codeBlockMatch[1]);
      return codeBlockMatch[1];
    } catch {
      // 不是有效 JSON
    }
  }

  // 尝试找到第一个 { 和最后一个 }
  const firstBrace = output.indexOf('{');
  const lastBrace = output.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = output.slice(firstBrace, lastBrace + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // 不是有效 JSON
    }
  }

  return null;
}
