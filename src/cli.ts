/**
 * 命令行参数解析 + REPL 循环
 *
 * 提供命令行参数解析和交互式 REPL 输入循环。
 * 支持交互模式（默认）和一次性模式（带 prompt 参数）。
 *
 * 参考 Claude Code: src/screens/REPL.tsx
 * 简化：readline + chalk 代替 React + Ink
 */

import * as readline from 'node:readline';
import chalk from 'chalk';
import type { Agent } from './agent.js';
import type { CliArgs } from './types.js';
import { printCost, printTokenBar } from './ui.js';
import { createMemory, listMemories } from './memory/index.js';
import { createPlanModeState, enterPlanMode } from './plan-mode.js';
import { resetPromptCache } from './prompt.js';
import { getBuiltinSkills, getSkillPrompt, loadSkills } from './skills/index.js';
import { createTask, listTasks as listAllTasks, getProgressSummary } from './tasks/index.js';

/**
 * 解析命令行参数。
 *
 * 支持的参数：
 * - `--provider <name>` — AI 提供商（默认 'anthropic'）
 * - `--model <name>` — 模型名称（默认由提供商决定）
 * - `--yolo` — 跳过所有确认提示
 * - `--resume` — 恢复上次会话
 * - 位置参数 — 一次性模式的 prompt
 *
 * @returns 解析后的 CLI 参数
 */
export function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    provider: 'anthropic',
    yolo: false,
    resume: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--provider':
        result.provider = args[++i] ?? 'anthropic';
        break;
      case '--model':
        result.model = args[++i];
        break;
      case '--yolo':
        result.yolo = true;
        break;
      case '--resume':
        result.resume = true;
        break;
      default:
        if (!arg.startsWith('--')) {
          positional.push(arg);
        }
        break;
    }
  }

  if (positional.length > 0) {
    result.prompt = positional.join(' ');
  }

  return result;
}

/**
 * 运行交互式 REPL。
 *
 * 功能：
 * - 显示 `> ` 提示符，接受用户输入
 * - 处理斜杠命令：`/clear`、`/cost`、`/compact`
 * - 调用 `agent.chat(input)` 处理普通消息
 * - Ctrl+C 处理：处理中时中止操作，空闲时双击退出
 *
 * @param agent - Agent 实例
 */
export async function runRepl(agent: Agent): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let ctrlCCount = 0;
  let planState = createPlanModeState();

  // Handle Ctrl+C
  rl.on('SIGINT', () => {
    if (agent.isProcessing) {
      // Abort current operation
      agent.abort();
      console.log(chalk.yellow('\n⏹ Aborted'));
    } else {
      ctrlCCount++;
      if (ctrlCCount >= 2) {
        console.log(chalk.dim('\nGoodbye!'));
        rl.close();
        process.exit(0);
      }
      console.log(chalk.dim('\nPress Ctrl+C again to exit'));
    }
  });

  const prompt = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const indicator = planState.active ? chalk.magenta('[PLAN]> ') : chalk.cyan('> ');
      rl.question(indicator, (answer) => {
        resolve(answer);
      });
      rl.once('close', () => reject(new Error('readline closed')));
    });

  console.log(chalk.green('Mini Claude Code') + chalk.dim(' — type your message, /clear, /cost, or Ctrl+C to exit'));
  console.log();

  while (true) {
    try {
      const input = await prompt();
      ctrlCCount = 0; // Reset Ctrl+C counter on any input

      const trimmed = input.trim();
      if (!trimmed) continue;

      // Handle slash commands
      if (trimmed.startsWith('/')) {
        switch (trimmed) {
          case '/clear':
            agent.clearHistory();
            resetPromptCache();
            console.log(chalk.dim('Conversation cleared.'));
            continue;
          case '/cost': {
            const usage = agent.tokenUsage;
            printCost(usage.inputTokens, usage.outputTokens);
            continue;
          }
          case '/compact':
            try {
              await agent.compact();
              resetPromptCache();
              console.log(chalk.dim('Conversation compacted.'));
            } catch {
              console.log(chalk.dim('Compact not yet implemented.'));
            }
            continue;
          case '/plan':
            if (planState.active) {
              console.log(chalk.yellow('Already in plan mode. Use the agent to generate and submit a plan.'));
            } else {
              planState = enterPlanMode(planState, agent.config.yolo);
              console.log(chalk.cyan('[PLAN MODE] Entering plan mode — read-only tools only'));
              console.log(chalk.dim('  The agent will explore the codebase and generate a plan.'));
              console.log(chalk.dim('  Write tools are disabled until the plan is approved.'));
            }
            continue;
          case '/status': {
            const usage = agent.tokenUsage;
            const total = usage.inputTokens + usage.outputTokens;
            console.log(chalk.cyan('Session Status:'));
            console.log(chalk.dim(`  Messages: ${agent.messages.length}`));
            console.log(chalk.dim(`  Tokens: ${total.toLocaleString()}`));
            printTokenBar(usage.inputTokens, usage.outputTokens, agent.config.effectiveContextWindow);
            console.log(chalk.dim(`  Plan mode: ${planState.active ? 'active' : 'inactive'}`));
            continue;
          }
          case '/rules': {
            console.log(chalk.cyan('Permission Rules:'));
            console.log(chalk.dim('  (No rules configured)'));
            continue;
          }
          default:
            // Handle /remember <text>
            if (trimmed.startsWith('/remember ')) {
              const text = trimmed.slice('/remember '.length).trim();
              if (!text) {
                console.log(chalk.red('Usage: /remember <text>'));
                continue;
              }
              try {
                // Auto-classify memory type based on content
                let type: 'user' | 'feedback' | 'project' | 'reference' = 'reference';
                const lower = text.toLowerCase();
                if (lower.includes('prefer') || lower.includes('always') || lower.includes('never') || lower.includes('i like') || lower.includes('i want')) {
                  type = 'user';
                } else if (lower.includes('instead') || lower.includes('not') || lower.includes('use') || lower.includes('should') || lower.includes('correct')) {
                  type = 'feedback';
                } else if (lower.includes('deadline') || lower.includes('release') || lower.includes('sprint') || lower.includes('meeting') || lower.includes('date')) {
                  type = 'project';
                }
                const description = text.slice(0, 80);
                const filename = createMemory(type, description, text);
                console.log(chalk.green(`Memory saved: ${filename} [${type}]`));
              } catch (err) {
                console.log(chalk.red(`Failed to save memory: ${err instanceof Error ? err.message : String(err)}`));
              }
              continue;
            }
            // Handle /memory
            if (trimmed === '/memory') {
              try {
                const memories = listMemories();
                if (memories.length === 0) {
                  console.log(chalk.dim('No memories stored. Use /remember <text> to create one.'));
                } else {
                  console.log(chalk.green(`Memories (${memories.length}):`));
                  for (const m of memories) {
                    console.log(chalk.dim(`  [${m.type}] ${m.filename} (${m.age}): ${m.description}`));
                  }
                }
              } catch (err) {
                console.log(chalk.red(`Failed to list memories: ${err instanceof Error ? err.message : String(err)}`));
              }
              continue;
            }

            // Handle built-in skill commands: /commit, /review, /debug
            if (trimmed === '/commit' || trimmed === '/review' || trimmed === '/debug') {
              const skillName = trimmed.slice(1);
              const builtins = getBuiltinSkills();
              const skill = builtins.find((s) => s.name === skillName);
              if (skill) {
                console.log(chalk.cyan(`[Skill: ${skill.name}] ${skill.description}`));
                await agent.chat(skill.prompt);
                console.log();
              }
              continue;
            }

            // Handle /skill <name> — invoke a custom or built-in skill
            if (trimmed.startsWith('/skill ')) {
              const skillName = trimmed.slice('/skill '.length).trim();
              if (!skillName) {
                console.log(chalk.red('Usage: /skill <name>'));
                continue;
              }
              // Check builtins first
              const builtins = getBuiltinSkills();
              const builtin = builtins.find((s) => s.name === skillName);
              if (builtin) {
                console.log(chalk.cyan(`[Skill: ${builtin.name}] ${builtin.description}`));
                await agent.chat(builtin.prompt);
                console.log();
                continue;
              }
              // Check custom skills
              const prompt = getSkillPrompt(skillName);
              if (prompt) {
                console.log(chalk.cyan(`[Skill: ${skillName}]`));
                await agent.chat(prompt);
                console.log();
              } else {
                // List available skills
                const customs = loadSkills();
                const allNames = [...builtins.map((s) => s.name), ...customs.map((s) => s.name)];
                console.log(chalk.red(`Skill "${skillName}" not found.`));
                if (allNames.length > 0) {
                  console.log(chalk.dim(`Available skills: ${allNames.join(', ')}`));
                }
              }
              continue;
            }

            // Handle /skill (no args) — list all skills
            if (trimmed === '/skill') {
              const builtins = getBuiltinSkills();
              const customs = loadSkills();
              console.log(chalk.cyan('Skills:'));
              console.log(chalk.dim('  Built-in:'));
              for (const s of builtins) {
                console.log(chalk.dim(`    /${s.name} — ${s.description}`));
              }
              if (customs.length > 0) {
                console.log(chalk.dim('  Custom:'));
                for (const s of customs) {
                  console.log(chalk.dim(`    /skill ${s.name} — ${s.description} [${s.trigger}]`));
                }
              }
              continue;
            }

            // Handle /task commands
            if (trimmed.startsWith('/task')) {
              const taskArgs = trimmed.slice('/task'.length).trim();

              // /task list or /task (no args)
              if (!taskArgs || taskArgs === 'list') {
                const tasks = listAllTasks();
                if (tasks.length === 0) {
                  console.log(chalk.dim('No tasks. Use /task add <title> to create one.'));
                } else {
                  console.log(chalk.cyan(`Tasks (${getProgressSummary()}):`));
                  for (const t of tasks) {
                    const statusIcon =
                      t.status === 'completed' ? '✅' :
                      t.status === 'in_progress' ? '🔄' :
                      t.status === 'failed' ? '❌' : '⏳';
                    console.log(chalk.dim(`  ${statusIcon} [${t.id}] ${t.title} (${t.status})`));
                  }
                }
                continue;
              }

              // /task add <title>
              if (taskArgs.startsWith('add ')) {
                const title = taskArgs.slice('add '.length).trim();
                if (!title) {
                  console.log(chalk.red('Usage: /task add <title>'));
                  continue;
                }
                const task = createTask(title);
                console.log(chalk.green(`Task created: ${task.id} — ${task.title}`));
                continue;
              }

              // /task run <id>
              if (taskArgs.startsWith('run ')) {
                const taskId = taskArgs.slice('run '.length).trim();
                if (!taskId) {
                  console.log(chalk.red('Usage: /task run <id>'));
                  continue;
                }
                console.log(chalk.cyan(`Running task ${taskId}...`));
                await agent.chat(`Execute task: ${taskId}. Find the task details and complete it.`);
                console.log();
                continue;
              }

              console.log(chalk.red('Usage: /task [list|add <title>|run <id>]'));
              continue;
            }

            console.log(chalk.red(`Unknown command: ${trimmed}`));
            continue;
        }
      }

      // Regular message — send to agent
      await agent.chat(trimmed);
      console.log(); // Blank line after response
    } catch (error) {
      if (error instanceof Error && error.message === 'readline closed') {
        break;
      }
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}
