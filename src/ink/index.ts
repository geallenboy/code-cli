/**
 * Ink UI 模块入口
 *
 * 组件化终端 UI 系统。
 * 支持 --no-ink 降级到 chalk 输出（P33）。
 */

export { InkRenderer, type InkRendererConfig } from './renderer.js';
export { StreamingText } from './components/streaming-text.js';
export { PermissionDialog, type PermissionChoice } from './components/permission-dialog.js';
export { ToolProgress, type ToolProgressState } from './components/tool-progress.js';
export { InkSpinner, type SpinnerStyle } from './components/spinner.js';
