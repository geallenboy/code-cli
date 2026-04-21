/**
 * 权限规则系统
 *
 * 支持 3 种规则来源（用户设置、项目设置、会话规则）和 3 种匹配模式
 * （精确匹配、前缀匹配、通配符匹配），deny-first 优先级。
 *
 * 参考 Claude Code: src/utils/permissions/ (7 个规则来源、3 种匹配模式)
 * 简化：3 个来源、3 种匹配模式、deny-first 优先级
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

type RuleBehavior = 'allow' | 'deny' | 'ask';

interface PermissionRule {
  tool: string;
  pattern: string;
  behavior: RuleBehavior;
  source: string;
}

interface PermissionSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
  };
}

export class PermissionSystem {
  private rules: PermissionRule[] = [];
  private sessionRules: PermissionRule[] = [];

  constructor() {
    this.loadRules();
  }

  /** Load rules from user settings, project settings */
  private loadRules(): void {
    // User settings: ~/.code-cli/settings.json
    this.loadFromFile(join(homedir(), '.code-cli', 'settings.json'), 'user');
    // Project settings: .code-cli/settings.json
    this.loadFromFile(join(process.cwd(), '.code-cli', 'settings.json'), 'project');
  }

  private loadFromFile(path: string, source: string): void {
    try {
      if (!existsSync(path)) return;
      const content = JSON.parse(readFileSync(path, 'utf-8')) as PermissionSettings;
      const perms = content.permissions;
      if (!perms) return;
      for (const rule of perms.allow ?? []) this.rules.push(this.parseRule(rule, 'allow', source));
      for (const rule of perms.deny ?? []) this.rules.push(this.parseRule(rule, 'deny', source));
      for (const rule of perms.ask ?? []) this.rules.push(this.parseRule(rule, 'ask', source));
    } catch {
      /* ignore invalid settings */
    }
  }

  private parseRule(ruleStr: string, behavior: RuleBehavior, source: string): PermissionRule {
    // Format: ToolName(pattern) e.g. Bash(npm test), Bash(git:*), Bash(git *)
    const match = ruleStr.match(/^(\w+)\((.+)\)$/);
    if (match) {
      return { tool: match[1], pattern: match[2], behavior, source };
    }
    // Simple format: just tool name
    return { tool: ruleStr, pattern: '*', behavior, source };
  }

  /** Evaluate a tool call against rules. Returns behavior or null (no match). */
  evaluate(toolName: string, input: Record<string, unknown>): RuleBehavior | null {
    const content = this.getContentString(toolName, input);
    const allRules = [...this.rules, ...this.sessionRules];

    // Deny-first: check deny rules across all sources
    for (const rule of allRules) {
      if (rule.behavior === 'deny' && this.matchRule(rule, toolName, content)) {
        return 'deny';
      }
    }
    // Then check allow
    for (const rule of allRules) {
      if (rule.behavior === 'allow' && this.matchRule(rule, toolName, content)) {
        return 'allow';
      }
    }
    // Then check ask
    for (const rule of allRules) {
      if (rule.behavior === 'ask' && this.matchRule(rule, toolName, content)) {
        return 'ask';
      }
    }
    return null; // No matching rule
  }

  /** Add a session-level allow rule */
  addSessionRule(toolName: string, content: string): void {
    this.sessionRules.push({
      tool: this.mapToolName(toolName),
      pattern: content,
      behavior: 'allow',
      source: 'session',
    });
  }

  /** Get all active rules for display */
  getAllRules(): PermissionRule[] {
    return [...this.rules, ...this.sessionRules];
  }

  private mapToolName(toolName: string): string {
    // Map internal tool names to rule format
    const map: Record<string, string> = {
      run_shell: 'Bash',
      write_file: 'Write',
      edit_file: 'Edit',
      read_file: 'Read',
    };
    return map[toolName] ?? toolName;
  }

  private getContentString(toolName: string, input: Record<string, unknown>): string {
    if (toolName === 'run_shell') return String(input['command'] ?? '');
    if (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'read_file')
      return String(input['file_path'] ?? '');
    return JSON.stringify(input);
  }

  private matchRule(rule: PermissionRule, toolName: string, content: string): boolean {
    const mappedName = this.mapToolName(toolName);
    if (rule.tool !== mappedName && rule.tool !== '*') return false;

    // Exact match
    if (rule.pattern === content) return true;
    // Wildcard *
    if (rule.pattern === '*') return true;
    // Prefix match: pattern ends with :*
    if (rule.pattern.endsWith(':*')) {
      const prefix = rule.pattern.slice(0, -2);
      return content.startsWith(prefix);
    }
    // Glob-style: pattern contains *
    if (rule.pattern.includes('*')) {
      const regex = new RegExp('^' + rule.pattern.replace(/\*/g, '.*') + '$');
      return regex.test(content);
    }
    return false;
  }
}
