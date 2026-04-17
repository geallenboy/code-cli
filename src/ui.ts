/**
 * 终端 UI 输出
 *
 * 提供彩色格式化输出函数，用于在终端中显示
 * 工具调用、工具结果、AI 文本和成本信息。
 *
 * 参考 Claude Code: src/screens/ (React + Ink 组件)
 * 简化：纯函数 + chalk 彩色输出
 */

import chalk from 'chalk';

/**
 * 获取工具对应的图标
 * @param name - 工具名称
 * @returns 对应的 emoji 图标
 */
function getToolIcon(name: string): string {
  const icons: Record<string, string> = {
    read_file: '📖',
    write_file: '✏️',
    edit_file: '🔧',
    run_shell: '💻',
    grep_search: '🔍',
    list_files: '📁',
  };
  return icons[name] ?? '🔧';
}

/**
 * 打印工具调用信息（黄色 + 图标）
 * @param name - 工具名称
 * @param input - 工具输入参数
 */
export function printToolCall(name: string, input: Record<string, unknown>): void {
  const icon = getToolIcon(name);
  console.log(chalk.yellow(`\n${icon} ${name}`));
  const summary = Object.entries(input)
    .map(([k, v]) => `  ${k}: ${typeof v === 'string' && v.length > 100 ? v.slice(0, 100) + '...' : v}`)
    .join('\n');
  if (summary) console.log(chalk.dim(summary));
}

/**
 * 打印工具结果（截断到 500 字符显示）
 * @param _name - 工具名称（保留用于未来扩展）
 * @param result - 工具执行结果
 */
export function printToolResult(_name: string, result: string): void {
  const display = result.length > 500 ? result.slice(0, 497) + '...' : result;
  console.log(chalk.dim(`  ↳ ${display.split('\n').join('\n    ')}`));
}

/**
 * 打印 AI 助手文本（流式，绿色）
 * @param text - 文本内容
 */
export function printAssistantText(text: string): void {
  process.stdout.write(chalk.green(text));
}

/**
 * 打印 token 使用量和成本估算
 * @param inputTokens - 输入 token 数
 * @param outputTokens - 输出 token 数
 */
export function printCost(inputTokens: number, outputTokens: number): void {
  console.log(chalk.cyan(`\nTokens: ${inputTokens} input, ${outputTokens} output`));
}
