/**
 * 技能存储与加载
 *
 * 从 ~/.gearcode/skills/ 加载 Markdown + YAML frontmatter 技能定义。
 * 懒加载：启动时只读 frontmatter，调用时加载完整内容。
 *
 * 参考 Claude Code: src/skills/ 系统
 */

import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SKILLS_DIR = join(homedir(), '.gearcode', 'skills');

export interface SkillDefinition {
  name: string;
  description: string;
  trigger: 'manual' | 'auto' | 'both';
  prompt: string; // Loaded lazily
  _loaded: boolean;
}

function ensureDir(): void {
  mkdirSync(SKILLS_DIR, { recursive: true });
}

/** Parse YAML frontmatter from skill file (lazy: only frontmatter) */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return result;
}

/** Load all skills (frontmatter only — lazy) */
export function loadSkills(): SkillDefinition[] {
  ensureDir();
  try {
    return readdirSync(SKILLS_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((filename) => {
        const raw = readFileSync(join(SKILLS_DIR, filename), 'utf-8');
        const fm = parseFrontmatter(raw);
        return {
          name: fm.name ?? filename.replace('.md', ''),
          description: fm.description ?? '',
          trigger: (fm.trigger ?? 'manual') as 'manual' | 'auto' | 'both',
          prompt: '', // Lazy — not loaded yet
          _loaded: false,
        };
      });
  } catch {
    return [];
  }
}

/** Load full skill content on demand */
export function getSkillPrompt(name: string): string {
  const path = join(SKILLS_DIR, `${name}.md`);
  if (!existsSync(path)) return '';
  const raw = readFileSync(path, 'utf-8');
  return raw.replace(/^---[\s\S]*?---\n*/, ''); // Strip frontmatter
}

/** Get 3 built-in skill definitions */
export function getBuiltinSkills(): SkillDefinition[] {
  return [
    {
      name: 'commit',
      description: 'Generate a commit message and create a git commit',
      trigger: 'manual',
      prompt:
        'Analyze the current git diff (run `git diff --staged` or `git diff`), generate a concise commit message following conventional commits format, and execute `git add -A && git commit -m "<message>"`',
      _loaded: true,
    },
    {
      name: 'review',
      description: 'Review current code changes and suggest improvements',
      trigger: 'manual',
      prompt:
        'Run `git diff` to see current changes, then provide a code review: identify potential bugs, suggest improvements, check for best practices violations, and note any security concerns.',
      _loaded: true,
    },
    {
      name: 'debug',
      description: 'Analyze an error and suggest a fix',
      trigger: 'manual',
      prompt:
        'The user has encountered an error. Read the relevant files, analyze the error, identify the root cause, and suggest a fix. If possible, apply the fix using edit_file.',
      _loaded: true,
    },
  ];
}
