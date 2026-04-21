/**
 * Ink 渲染器
 *
 * 组件化终端 UI 渲染器。
 * 管理组件生命周期和渲染更新。
 *
 * 支持两种模式：
 * - Ink 模式：组件化渲染（默认）
 * - Chalk 模式：--no-ink 降级到传统 chalk 输出（P33）
 *
 * 参考 Claude Code: React + Ink 终端 UI
 */

import chalk from 'chalk';
import { StreamingText } from './components/streaming-text.js';
import { ToolProgress, type ToolProgressState } from './components/tool-progress.js';
import { InkSpinner } from './components/spinner.js';
import { PermissionDialog, type PermissionChoice } from './components/permission-dialog.js';

/** 渲染器配置 */
export interface InkRendererConfig {
  /** 是否使用 Ink 模式（false = chalk 降级） */
  useInk: boolean;
  /** 是否启用颜色 */
  color?: boolean;
}

/**
 * Ink 渲染器
 *
 * 统一的终端 UI 渲染接口。
 * 根据配置选择 Ink 组件渲染或 chalk 降级渲染。
 */
export class InkRenderer {
  private readonly config: InkRendererConfig;
  private readonly streamingText: StreamingText;
  private readonly toolProgress: ToolProgress;
  private readonly spinner: InkSpinner;
  private readonly permissionDialog: PermissionDialog;

  constructor(config: InkRendererConfig) {
    this.config = config;
    this.streamingText = new StreamingText();
    this.toolProgress = new ToolProgress();
    this.spinner = new InkSpinner();
    this.permissionDialog = new PermissionDialog();
  }

  /** 是否使用 Ink 模式 */
  get isInkMode(): boolean {
    return this.config.useInk;
  }

  /**
   * 渲染流式文本
   *
   * @param text - 文本片段
   */
  renderStreamingText(text: string): string {
    if (this.config.useInk) {
      return this.streamingText.render(text);
    }
    // P33: chalk 降级
    return text;
  }

  /**
   * 渲染工具进度
   *
   * @param state - 工具进度状态
   */
  renderToolProgress(state: ToolProgressState): string {
    if (this.config.useInk) {
      return this.toolProgress.render(state);
    }
    // P33: chalk 降级
    const elapsed = state.elapsed ? ` (${state.elapsed}ms)` : '';
    const status = state.status === 'running' ? '⏳' : state.status === 'completed' ? '✅' : '❌';
    const indent = '  '.repeat(state.depth ?? 0);
    return `${indent}${status} ${state.toolName}${elapsed}`;
  }

  /**
   * 渲染 spinner
   *
   * @param message - spinner 消息
   */
  renderSpinner(message: string): string {
    if (this.config.useInk) {
      return this.spinner.render(message);
    }
    // P33: chalk 降级
    return chalk.dim(`⠋ ${message}`);
  }

  /**
   * 渲染权限对话框
   *
   * @param toolName - 工具名称
   * @param riskExplanation - 风险说明
   * @param suggestedRule - 建议规则
   */
  renderPermissionDialog(
    toolName: string,
    riskExplanation: string,
    suggestedRule?: string,
  ): string {
    if (this.config.useInk) {
      return this.permissionDialog.render(toolName, riskExplanation, suggestedRule);
    }
    // P33: chalk 降级
    const lines = [
      chalk.yellow(`⚠ Permission required: ${toolName}`),
      chalk.dim(`  Risk: ${riskExplanation}`),
    ];
    if (suggestedRule) {
      lines.push(chalk.dim(`  Suggested rule: ${suggestedRule}`));
    }
    lines.push(chalk.cyan('  [y]es / [n]o / [a]lways'));
    return lines.join('\n');
  }

  /**
   * 格式化权限选择结果
   */
  formatPermissionChoice(choice: PermissionChoice): string {
    switch (choice) {
      case 'yes': return chalk.green('Allowed');
      case 'no': return chalk.red('Denied');
      case 'always': return chalk.green('Always allowed');
    }
  }

  /** 清除当前行 */
  clearLine(): void {
    if (this.config.useInk) {
      process.stdout.write('\r\x1b[K');
    }
  }
}
