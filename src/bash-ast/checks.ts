/**
 * 增强安全检查（23 个）
 *
 * 在原有 15 个检查基础上新增 8 个：
 * 16. Heredoc 注入
 * 17. 进程替换
 * 18. 算术注入
 * 19. 别名覆盖
 * 20. History 操作
 * 21. Crontab 修改
 * 22. Docker 逃逸
 * 23. 网络监听
 *
 * 参考 Claude Code: 23 个静态安全检查
 */

import { parseCommand, runSecurityChecks, type SecurityCheckResult } from '../bash-parser.js';
import { BashAstParser } from './parser.js';
import { AstWalker } from './walker.js';

/** 安全检查总数 */
export const SECURITY_CHECK_COUNT = 23;

/** 增强安全检查结果 */
export interface EnhancedSecurityResult {
  /** 所有检查结果（23 个） */
  checks: SecurityCheckResult[];
  /** 是否全部通过 */
  allPassed: boolean;
  /** 失败的检查数量 */
  failedCount: number;
  /** 是否使用了降级解析器 */
  usedFallback: boolean;
}

/**
 * 运行 23 个增强安全检查
 *
 * 先运行原有 15 个检查，再运行 8 个新增检查。
 * 使用增强 AST 解析器，失败时降级到基础解析器（P32）。
 *
 * @param command - Bash 命令字符串
 * @returns 增强安全检查结果
 */
export function runEnhancedSecurityChecks(command: string): EnhancedSecurityResult {
  // 运行原有 15 个检查
  const tokens = parseCommand(command);
  const baseChecks = runSecurityChecks(tokens);

  // 使用增强解析器
  const parser = new BashAstParser();
  const { ast, fallback } = parser.parse(command);
  const walker = new AstWalker();
  const commands = walker.extractCommands(ast);
  const fullText = command;

  // 新增 8 个检查
  const newChecks: SecurityCheckResult[] = [];

  // 16. Heredoc 注入
  {
    const hasHeredoc = ast.children.some(n => n.type === 'heredoc');
    const heredocToShell = /<<\s*\w+[\s\S]*(?:sh|bash|eval)\b/.test(fullText);
    const failed = hasHeredoc && heredocToShell;
    newChecks.push({
      check: 'heredoc_injection',
      passed: !failed,
      detail: failed ? 'Heredoc content piped to shell detected' : undefined,
    });
  }

  // 17. 进程替换
  {
    const hasProcSub = ast.children.some(n => n.type === 'process_sub') ||
      /[<>]\([^)]+\)/.test(fullText);
    newChecks.push({
      check: 'process_substitution',
      passed: !hasProcSub,
      detail: hasProcSub ? 'Process substitution detected' : undefined,
    });
  }

  // 18. 算术注入
  {
    // 算术展开本身不危险，但包含命令替换时危险
    const arithWithCmd = /\$\(\(.*\$\(.*\).*\)\)/.test(fullText);
    newChecks.push({
      check: 'arithmetic_injection',
      passed: !arithWithCmd,
      detail: arithWithCmd ? 'Command substitution inside arithmetic expansion detected' : undefined,
    });
  }

  // 19. 别名覆盖
  {
    const aliasOverride = /\balias\s+(?:ls|cd|rm|cp|mv|cat|grep|sudo|su)\s*=/.test(fullText);
    newChecks.push({
      check: 'alias_override',
      passed: !aliasOverride,
      detail: aliasOverride ? 'Override of common command alias detected' : undefined,
    });
  }

  // 20. History 操作
  {
    const historyOp = /\bhistory\s+(?:-c|-d|-w)/.test(fullText) ||
      /\bHISTFILE\s*=/.test(fullText) ||
      /\bunset\s+HISTFILE\b/.test(fullText);
    newChecks.push({
      check: 'history_manipulation',
      passed: !historyOp,
      detail: historyOp ? 'Shell history manipulation detected' : undefined,
    });
  }

  // 21. Crontab 修改
  {
    const crontabMod = commands.some(c => c.name === 'crontab') ||
      /\bcrontab\s+(?:-e|-r|-l)/.test(fullText) ||
      />\s*\/etc\/cron/.test(fullText);
    newChecks.push({
      check: 'crontab_modification',
      passed: !crontabMod,
      detail: crontabMod ? 'Crontab modification detected' : undefined,
    });
  }

  // 22. Docker 逃逸
  {
    const dockerEscape =
      /\bdocker\s+run\b.*--privileged/.test(fullText) ||
      /\bdocker\s+run\b.*-v\s+\//.test(fullText) ||
      /\bdocker\s+exec\b.*--privileged/.test(fullText) ||
      /\bnsenter\b/.test(fullText);
    newChecks.push({
      check: 'docker_escape',
      passed: !dockerEscape,
      detail: dockerEscape ? 'Potential Docker escape detected' : undefined,
    });
  }

  // 23. 网络监听
  {
    const netListen =
      commands.some(c => ['nc', 'ncat', 'netcat', 'socat'].includes(c.name)) ||
      /\bnc\s+.*-l/.test(fullText) ||
      /\bsocat\b.*TCP-LISTEN/.test(fullText) ||
      /\bpython\b.*SimpleHTTPServer/.test(fullText) ||
      /\bpython3?\s+-m\s+http\.server/.test(fullText);
    newChecks.push({
      check: 'network_listen',
      passed: !netListen,
      detail: netListen ? 'Network listening detected' : undefined,
    });
  }

  const allChecks = [...baseChecks, ...newChecks];
  const failedCount = allChecks.filter(c => !c.passed).length;

  return {
    checks: allChecks,
    allPassed: failedCount === 0,
    failedCount,
    usedFallback: fallback,
  };
}
