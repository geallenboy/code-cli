/**
 * 权限确认对话框组件
 *
 * 显示风险解释、建议规则和 y/n/always 选项。
 * 增强功能：防误触延迟、风险等级颜色编码、延迟期间视觉指示。
 *
 * 参考 Claude Code: permission-dialog.tsx
 */

import chalk from 'chalk';
import { renderBox } from '../../box.js';

/** 权限选择 */
export type PermissionChoice = 'yes' | 'no' | 'always';

/** 风险等级 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** 权限对话框选项 */
export interface PermissionDialogOptions {
  toolName: string;
  riskLevel: RiskLevel;
  riskExplanation: string;
  suggestedRule?: string;
  antiMisclickDelay?: number; // 默认 200ms
}

/**
 * 根据风险等级返回对应的 chalk 颜色函数
 */
export function getRiskColor(riskLevel: RiskLevel): (text: string) => string {
  switch (riskLevel) {
    case 'LOW':
      return chalk.green;
    case 'MEDIUM':
      return chalk.yellow;
    case 'HIGH':
      return chalk.red;
  }
}

/**
 * 权限确认对话框
 *
 * 渲染权限确认 UI：
 * - 工具名称和风险说明
 * - 风险等级颜色编码
 * - 建议的权限规则
 * - y/n/always 选项
 * - 防误触延迟
 */
export class PermissionDialog {
  private _readyTime = 0;

  /**
   * 渲染权限对话框（基础版本，向后兼容）
   * 不设置防误触延迟，保持原有行为。
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
   * 渲染增强版权限对话框（使用 Box Drawing 边框）
   *
   * @param options - 对话框选项
   * @returns 格式化的对话框文本
   */
  renderEnhanced(options: PermissionDialogOptions): string {
    const delay = options.antiMisclickDelay ?? 200;
    this._readyTime = Date.now() + delay;

    const riskColor = getRiskColor(options.riskLevel);
    const lines: string[] = [];

    // 工具信息
    lines.push(`Tool: ${options.toolName}`);
    lines.push(`Risk: ${riskColor(options.riskLevel)} - ${options.riskExplanation}`);

    // 建议规则
    if (options.suggestedRule) {
      lines.push('');
      lines.push(chalk.dim(`Suggested rule: ${options.suggestedRule}`));
    }

    // 选项 - 延迟期间使用 dim 渲染
    lines.push('');
    if (this.isInDelay()) {
      lines.push(
        chalk.dim(`[y]es  [n]o  [a]lways`),
      );
    } else {
      lines.push(
        `${chalk.green('[y]')}es  ${chalk.red('[n]')}o  ${chalk.cyan('[a]')}lways`,
      );
    }

    return renderBox('⚠ Permission Required', lines);
  }

  /**
   * 渲染选项文本（用于延迟结束后刷新显示）
   *
   * @returns 格式化的选项行
   */
  renderOptions(): string {
    if (this.isInDelay()) {
      return chalk.dim(`  [y]es  [n]o  [a]lways`);
    }
    return `  ${chalk.green('[y]')}es  ${chalk.red('[n]')}o  ${chalk.cyan('[a]')}lways`;
  }

  /**
   * 检查是否仍在防误触延迟期间
   */
  isInDelay(): boolean {
    return Date.now() < this._readyTime;
  }

  /**
   * 获取剩余延迟时间（毫秒）
   */
  getRemainingDelay(): number {
    return Math.max(0, this._readyTime - Date.now());
  }

  /**
   * 解析用户输入为权限选择
   * 在防误触延迟期间返回 null
   *
   * @param input - 用户输入
   * @returns 权限选择，无效输入或延迟期间返回 null
   */
  parseChoice(input: string): PermissionChoice | null {
    // 防误触延迟期间不接受输入
    if (this.isInDelay()) return null;

    const trimmed = input.trim().toLowerCase();
    if (trimmed === 'y' || trimmed === 'yes') return 'yes';
    if (trimmed === 'n' || trimmed === 'no') return 'no';
    if (trimmed === 'a' || trimmed === 'always') return 'always';
    return null;
  }
}
