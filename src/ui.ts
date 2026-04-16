/**
 * 终端 UI 输出
 *
 * 提供彩色格式化输出函数，用于在终端中显示
 * 工具调用、工具结果、AI 文本和成本信息。
 *
 * 参考 Claude Code: src/screens/ (React + Ink 组件)
 * 简化：纯函数 + chalk 彩色输出
 */

/**
 * 打印工具调用信息（黄色 + 图标）
 * @param name - 工具名称
 * @param input - 工具输入参数
 */
export function printToolCall(_name: string, _input: Record<string, unknown>): void {
  // TODO: Phase 1 — 实现工具调用显示
}

/**
 * 打印工具结果（截断到 500 字符显示）
 * @param name - 工具名称
 * @param result - 工具执行结果
 */
export function printToolResult(_name: string, _result: string): void {
  // TODO: Phase 1 — 实现工具结果显示
}

/**
 * 打印 AI 助手文本（流式，绿色）
 * @param text - 文本内容
 */
export function printAssistantText(_text: string): void {
  // TODO: Phase 1 — 实现流式文本显示
}

/**
 * 打印 token 使用量和成本估算
 * @param inputTokens - 输入 token 数
 * @param outputTokens - 输出 token 数
 */
export function printCost(_inputTokens: number, _outputTokens: number): void {
  // TODO: Phase 3 — 实现成本显示
}
