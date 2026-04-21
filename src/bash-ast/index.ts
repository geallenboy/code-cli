/**
 * Bash AST 模块入口
 *
 * 导出增强的 Bash AST 解析器和安全检查。
 * 提供 tree-sitter 风格的 AST 解析 + 23 个安全检查。
 */

export { BashAstParser, type AstNode, type ParseResult } from './parser.js';
export { AstWalker, type CommandInfo } from './walker.js';
export {
  runEnhancedSecurityChecks,
  SECURITY_CHECK_COUNT,
  type EnhancedSecurityResult,
} from './checks.js';
