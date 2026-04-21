/**
 * 权限确认对话框组件
 *
 * 显示风险解释、建议规则和 y/n/always 选项。
 *
 * 参考 Claude Code: permission-dialog.tsx
 */

import chalk from 'chalk';

/** 权限选择 */
export type PermissionChoice = 'yes' | 'no' | 'always';

/**
 * 权限确认对话框
 *
 * 渲染权限确认 UI：
 * - 工具名称和风险说明
 * - 建议的权限规则
 * - y/n/always 选项
 */
export class PermissionDialog {
  /**
   * 渲染权限对话框
   *
   * @param toolName - 工具名称
   * @param riskExplanation - 风险说明
   * @param suggestedRule - 建议规则
   * @returns 格式化的对话框文本
   */
  render(toolName: string, riskExplanation: string, suggestedRule?: string): string {
    const lines: string[] = [];

    // 标题
    lines.push(chalk.yellow.bold('⚠ Permission Required'));
    lines.push('');

    // 工具信息
    lines.push(chalk.white(`  Tool: ${chalk.bold(toolName)}`));
    lines.push(chalk.white(`  Risk: ${riskExplanation}`));

    // 建议规则
    if (suggestedRule) {
      lines.push('');
      lines.push(chalk.dim(`  Suggested rule: ${suggestedRule}`));
    }

    // 选项
    lines.push('');
    lines.push(
      `  ${chalk.green('[y]')}es  ${chalk.red('[n]')}o  ${chalk.cyan('[a]')}lways`,
    );

    return lines.join('\n');
  }

  /**
   * 解析用户输入为权限选择
   *
   * @param input - 用户输入
   * @returns 权限选择，无效输入返回 null
   */
  parseChoice(input: string): PermissionChoice | null {
    const trimmed = input.trim().toLowerCase();
    if (trimmed === 'y' || trimmed === 'yes') return 'yes';
    if (trimmed === 'n' || trimmed === 'no') return 'no';
    if (trimmed === 'a' || trimmed === 'always') return 'always';
    return null;
  }
}
