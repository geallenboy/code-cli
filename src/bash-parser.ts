/**
 * Bash AST 安全分析器
 *
 * 简单的命令解析器，将 Bash 命令字符串解析为结构化 token 树，
 * 并运行 15 个静态安全检查。
 *
 * 不使用 tree-sitter（太重），而是用简单的 tokenizer 实现。
 * 处理引号、转义、变量展开、命令替换、重定向和管道。
 *
 * 参考 Claude Code: src/tools/BashTool/ (7 层安全防御)
 * 简化：结构化解析 + 15 个静态检查
 */

/** Token types in the command tree */
export interface CommandToken {
  type: 'command' | 'argument' | 'redirect' | 'pipe' | 'and' | 'or' | 'semicolon' | 'subshell';
  value: string;
  children?: CommandToken[];
}

/** Result of a single security check */
export interface SecurityCheckResult {
  check: string;
  passed: boolean;
  detail?: string;
}

/**
 * Tokenize a raw command string into words, respecting quotes and escapes.
 * Returns an array of raw word strings.
 */
function tokenizeWords(cmd: string): string[] {
  const words: string[] = [];
  let current = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < cmd.length) {
    const ch = cmd[i] as string;

    // Escape handling
    if (ch === '\\' && !inSingle && i + 1 < cmd.length) {
      current += ch + (cmd[i + 1] as string);
      i += 2;
      continue;
    }

    // Single quote toggle
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      i++;
      continue;
    }

    // Double quote toggle
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      i++;
      continue;
    }

    // Inside quotes — everything is literal
    if (inSingle || inDouble) {
      current += ch;
      i++;
      continue;
    }

    // Operators: ||, &&, |, ;
    if (ch === '|' && cmd[i + 1] === '|') {
      if (current) { words.push(current); current = ''; }
      words.push('||');
      i += 2;
      continue;
    }
    if (ch === '&' && cmd[i + 1] === '&') {
      if (current) { words.push(current); current = ''; }
      words.push('&&');
      i += 2;
      continue;
    }
    if (ch === '|') {
      if (current) { words.push(current); current = ''; }
      words.push('|');
      i++;
      continue;
    }
    if (ch === ';') {
      if (current) { words.push(current); current = ''; }
      words.push(';');
      i++;
      continue;
    }

    // Redirections: >>, >
    if (ch === '>' && cmd[i + 1] === '>') {
      if (current) { words.push(current); current = ''; }
      words.push('>>');
      i += 2;
      continue;
    }
    if (ch === '>' || ch === '<') {
      if (current) { words.push(current); current = ''; }
      words.push(ch);
      i++;
      continue;
    }

    // Subshell: $( ... )
    if (ch === '$' && cmd[i + 1] === '(') {
      if (current) { words.push(current); current = ''; }
      // Find matching closing paren
      let depth = 1;
      let j = i + 2;
      while (j < cmd.length && depth > 0) {
        if (cmd[j] === '(') depth++;
        else if (cmd[j] === ')') depth--;
        j++;
      }
      words.push(cmd.slice(i, j));
      i = j;
      continue;
    }

    // Backtick command substitution
    if (ch === '`') {
      if (current) { words.push(current); current = ''; }
      const end = cmd.indexOf('`', i + 1);
      if (end === -1) {
        words.push(cmd.slice(i));
        i = cmd.length;
      } else {
        words.push(cmd.slice(i, end + 1));
        i = end + 1;
      }
      continue;
    }

    // Parentheses for subshells
    if (ch === '(') {
      if (current) { words.push(current); current = ''; }
      let depth = 1;
      let j = i + 1;
      while (j < cmd.length && depth > 0) {
        if (cmd[j] === '(') depth++;
        else if (cmd[j] === ')') depth--;
        j++;
      }
      words.push(cmd.slice(i, j));
      i = j;
      continue;
    }

    // Whitespace — word boundary
    if (/\s/.test(ch)) {
      if (current) { words.push(current); current = ''; }
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current) words.push(current);
  return words;
}

/**
 * Parse a bash command string into a token tree.
 *
 * Splits by operators (|, &&, ||, ;), handles quoted strings,
 * command substitution $() and backticks, and redirections.
 *
 * @param cmd - The bash command string to parse
 * @returns Array of CommandToken representing the parsed structure
 */
export function parseCommand(cmd: string): CommandToken[] {
  const trimmed = cmd.trim();
  if (!trimmed) return [];

  const words = tokenizeWords(trimmed);
  const tokens: CommandToken[] = [];
  let currentArgs: string[] = [];

  function flushCommand(): void {
    if (currentArgs.length === 0) return;
    const children: CommandToken[] = [];
    for (const arg of currentArgs) {
      if (arg.startsWith('$(') || arg.startsWith('`')) {
        const inner = arg.startsWith('$(')
          ? arg.slice(2, -1)
          : arg.slice(1, -1);
        children.push({
          type: 'subshell',
          value: arg,
          children: parseCommand(inner),
        });
      } else if (arg.startsWith('(') && arg.endsWith(')')) {
        children.push({
          type: 'subshell',
          value: arg,
          children: parseCommand(arg.slice(1, -1)),
        });
      } else {
        children.push({ type: 'argument', value: arg });
      }
    }
    tokens.push({
      type: 'command',
      value: currentArgs.join(' '),
      children,
    });
    currentArgs = [];
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;

    if (word === '|') {
      flushCommand();
      tokens.push({ type: 'pipe', value: '|' });
    } else if (word === '&&') {
      flushCommand();
      tokens.push({ type: 'and', value: '&&' });
    } else if (word === '||') {
      flushCommand();
      tokens.push({ type: 'or', value: '||' });
    } else if (word === ';') {
      flushCommand();
      tokens.push({ type: 'semicolon', value: ';' });
    } else if (word === '>' || word === '>>' || word === '<') {
      // Redirect: consume the next word as the target
      const target = words[i + 1] ?? '';
      currentArgs.push(word);
      if (target) {
        currentArgs.push(target);
        i++;
      }
    } else {
      currentArgs.push(word);
    }
  }

  flushCommand();
  return tokens;
}

/**
 * Extract actual command names from a token tree.
 *
 * For each command token, extracts the first non-env-prefix word.
 * e.g., "NODE_ENV=prod node server.js" → "node"
 * e.g., "sudo rm -rf /" → "sudo", "rm"
 *
 * @param tokens - Parsed token tree
 * @returns Array of command name strings
 */
export function extractCommandNames(tokens: CommandToken[]): string[] {
  const names: string[] = [];

  for (const token of tokens) {
    if (token.type === 'command' && token.children) {
      const args = token.children.filter((c) => c.type === 'argument');
      for (const arg of args) {
        const val = arg.value;
        // Skip env prefixes like KEY=VALUE
        if (/^\w+=/.test(val)) continue;
        // Skip redirections
        if (val === '>' || val === '>>' || val === '<') break;
        // Strip quotes
        const clean = val.replace(/^['"`]|['"`]$/g, '');
        names.push(clean);
        // If it's sudo or su, continue to get the actual command
        if (clean === 'sudo' || clean === 'su') continue;
        break;
      }
      // Recurse into subshells
      for (const child of token.children) {
        if (child.type === 'subshell' && child.children) {
          names.push(...extractCommandNames(child.children));
        }
      }
    }
    // Recurse into top-level subshells
    if (token.type === 'subshell' && token.children) {
      names.push(...extractCommandNames(token.children));
    }
  }

  return names;
}

/**
 * Flatten all text from a token tree for pattern matching.
 */
function flattenTokenText(tokens: CommandToken[]): string {
  return tokens.map((t) => {
    let text = t.value;
    if (t.children) {
      text += ' ' + flattenTokenText(t.children);
    }
    return text;
  }).join(' ');
}

/**
 * Collect all command tokens (including nested subshells) from a token tree.
 */
function collectAllCommands(tokens: CommandToken[]): CommandToken[] {
  const commands: CommandToken[] = [];
  for (const token of tokens) {
    if (token.type === 'command') {
      commands.push(token);
    }
    if (token.children) {
      commands.push(...collectAllCommands(token.children));
    }
  }
  return commands;
}

/**
 * Run 15 security checks against a token tree.
 *
 * Checks:
 * 1. System path write (/etc/, /usr/, ~/.ssh/)
 * 2. SSH key access
 * 3. Environment variable manipulation (PATH, HOME, LD_PRELOAD)
 * 4. Recursive delete (rm -rf, rm -r)
 * 5. Disk operations (dd, mkfs)
 * 6. Process termination (kill, pkill)
 * 7. System control (reboot, shutdown)
 * 8. Privilege escalation (sudo, su)
 * 9. Network exfiltration (curl POST, wget upload)
 * 10. Package publishing (npm publish, cargo publish)
 * 11. Git destructive (push --force, reset --hard, clean)
 * 12. File permission changes (chmod 777, chown root)
 * 13. Command substitution in arguments
 * 14. Pipe to shell (curl | sh, wget | bash)
 * 15. Base64 decode to shell
 *
 * @param tokens - Parsed token tree
 * @returns Array of SecurityCheckResult for each check
 */
export function runSecurityChecks(tokens: CommandToken[]): SecurityCheckResult[] {
  const fullText = flattenTokenText(tokens);
  const allCommands = collectAllCommands(tokens);
  const commandNames = extractCommandNames(tokens);
  const results: SecurityCheckResult[] = [];

  // 1. System path write
  {
    const systemPaths = ['/etc/', '/usr/', '~/.ssh/', '/sys/', '/proc/'];
    const hasWrite = allCommands.some((cmd) => {
      const text = cmd.value;
      return systemPaths.some((p) => text.includes(p)) &&
        (text.includes('>') || /\b(?:cp|mv|tee|install)\b/.test(text));
    });
    const redirectToSystem = />\s*(?:\/etc\/|\/usr\/|~\/\.ssh\/|\/sys\/|\/proc\/)/.test(fullText);
    const failed = hasWrite || redirectToSystem;
    results.push({
      check: 'system_path_write',
      passed: !failed,
      detail: failed ? 'Write to system path detected' : undefined,
    });
  }

  // 2. SSH key access
  {
    const sshAccess = /(?:~\/\.ssh\/|\/\.ssh\/|ssh-keygen|ssh-add)/.test(fullText);
    results.push({
      check: 'ssh_key_access',
      passed: !sshAccess,
      detail: sshAccess ? 'SSH key access detected' : undefined,
    });
  }

  // 3. Environment variable manipulation
  {
    const envManip = /\b(?:export|unset)\s+(?:PATH|HOME|LD_PRELOAD|LD_LIBRARY_PATH)\b/.test(fullText);
    results.push({
      check: 'env_var_manipulation',
      passed: !envManip,
      detail: envManip ? 'Sensitive environment variable manipulation detected' : undefined,
    });
  }

  // 4. Recursive delete
  {
    const recursiveDelete = commandNames.includes('rm') &&
      /\brm\s+(?:-\w*r\w*|-\w*f\w*r|-rf|-fr)\b/.test(fullText);
    results.push({
      check: 'recursive_delete',
      passed: !recursiveDelete,
      detail: recursiveDelete ? 'Recursive delete detected' : undefined,
    });
  }

  // 5. Disk operations
  {
    const diskOps = commandNames.some((n) => ['dd', 'mkfs', 'fdisk', 'parted'].includes(n));
    results.push({
      check: 'disk_operations',
      passed: !diskOps,
      detail: diskOps ? 'Disk operation detected' : undefined,
    });
  }

  // 6. Process termination
  {
    const procKill = commandNames.some((n) => ['kill', 'pkill', 'killall'].includes(n));
    results.push({
      check: 'process_termination',
      passed: !procKill,
      detail: procKill ? 'Process termination detected' : undefined,
    });
  }

  // 7. System control
  {
    const sysCtrl = commandNames.some((n) =>
      ['reboot', 'shutdown', 'halt', 'poweroff', 'init'].includes(n),
    );
    results.push({
      check: 'system_control',
      passed: !sysCtrl,
      detail: sysCtrl ? 'System control command detected' : undefined,
    });
  }

  // 8. Privilege escalation
  {
    const privEsc = commandNames.some((n) => ['sudo', 'su', 'doas'].includes(n));
    results.push({
      check: 'privilege_escalation',
      passed: !privEsc,
      detail: privEsc ? 'Privilege escalation detected' : undefined,
    });
  }

  // 9. Network exfiltration
  {
    const netExfil =
      /\bcurl\b.*(?:-X\s*POST|-d\s|--data|--upload-file|-F\s)/.test(fullText) ||
      /\bwget\b.*--post/.test(fullText);
    results.push({
      check: 'network_exfiltration',
      passed: !netExfil,
      detail: netExfil ? 'Network exfiltration detected' : undefined,
    });
  }

  // 10. Package publishing
  {
    const pkgPublish =
      /\bnpm\s+publish\b/.test(fullText) ||
      /\bcargo\s+publish\b/.test(fullText) ||
      /\bgem\s+push\b/.test(fullText) ||
      /\btwine\s+upload\b/.test(fullText);
    results.push({
      check: 'package_publishing',
      passed: !pkgPublish,
      detail: pkgPublish ? 'Package publishing detected' : undefined,
    });
  }

  // 11. Git destructive
  {
    const gitDestructive =
      /\bgit\s+push\b.*--force/.test(fullText) ||
      /\bgit\s+push\b.*-f\b/.test(fullText) ||
      /\bgit\s+reset\s+--hard\b/.test(fullText) ||
      /\bgit\s+clean\b/.test(fullText);
    results.push({
      check: 'git_destructive',
      passed: !gitDestructive,
      detail: gitDestructive ? 'Destructive git operation detected' : undefined,
    });
  }

  // 12. File permission changes
  {
    const permChange =
      /\bchmod\s+(?:777|666|a\+[rwx])/.test(fullText) ||
      /\bchown\s+root\b/.test(fullText);
    results.push({
      check: 'file_permission_change',
      passed: !permChange,
      detail: permChange ? 'Dangerous file permission change detected' : undefined,
    });
  }

  // 13. Command substitution in arguments
  {
    const cmdSubst = allCommands.some((cmd) =>
      cmd.children?.some((c) => c.type === 'subshell'),
    );
    results.push({
      check: 'command_substitution',
      passed: !cmdSubst,
      detail: cmdSubst ? 'Command substitution in arguments detected' : undefined,
    });
  }

  // 14. Pipe to shell
  {
    const pipeToShell =
      /\bcurl\b.*\|\s*(?:sh|bash|zsh)\b/.test(fullText) ||
      /\bwget\b.*\|\s*(?:sh|bash|zsh)\b/.test(fullText);
    results.push({
      check: 'pipe_to_shell',
      passed: !pipeToShell,
      detail: pipeToShell ? 'Pipe to shell detected' : undefined,
    });
  }

  // 15. Base64 decode to shell
  {
    const b64Shell = /\bbase64\s+-d\b.*\|\s*(?:sh|bash|zsh)\b/.test(fullText);
    results.push({
      check: 'base64_to_shell',
      passed: !b64Shell,
      detail: b64Shell ? 'Base64 decode piped to shell detected' : undefined,
    });
  }

  return results;
}
