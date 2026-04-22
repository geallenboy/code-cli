/**
 * 命令行参数解析 + REPL 循环
 *
 * 提供命令行参数解析和交互式 REPL 输入循环。
 * 支持交互模式（默认）和一次性模式（带 prompt 参数）。
 *
 * 参考 Claude Code: src/screens/REPL.tsx
 * 简化：readline + chalk 代替 React + Ink
 */

import chalk from 'chalk';
import * as readline from 'node:readline';
import type { Agent } from './agent.js';
import type { CliArgs } from './types.js';
import { printCost, printTokenBar } from './ui.js';
import { createMemory, listMemories } from './memory/index.js';
import { createPlanModeState, enterPlanMode } from './plan-mode.js';
import { resetPromptCache } from './prompt.js';
import { getBuiltinSkills, getSkillPrompt, loadSkills } from './skills/index.js';
import { createTask, listTasks as listAllTasks, getProgressSummary } from './tasks/index.js';
import type { McpManager } from './mcp/index.js';
import { MultiLineInput } from './input.js';
import { detectRecoverableSession, formatRecoveryPrompt, parseRecoveryAnswer } from './session-recovery.js';
import { renderWelcomeScreen } from './welcome.js';
import { renderBox, renderSeparator } from './box.js';

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
    mcp: false,
    coordinator: false,
    swarm: false,
    noThinking: false,
    json: false,
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
      case '--mcp':
        result.mcp = true;
        break;
      case '--coordinator':
        result.coordinator = true;
        break;
      case '--swarm':
        result.swarm = true;
        break;
      case '--thinking-budget':
        result.thinkingBudget = parseInt(args[++i] ?? '10000', 10);
        break;
      case '--no-thinking':
        result.noThinking = true;
        break;
      case '--json':
        result.json = true;
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
export async function runRepl(agent: Agent, mcpManager?: McpManager): Promise<void> {
  const multiLineInput = new MultiLineInput();

  let ctrlCCount = 0;
  let planState = createPlanModeState();

  // Set up Ctrl+C handler for abort-during-processing and double-Ctrl+C-to-exit.
  // MultiLineInput handles Ctrl+C during input (clears buffer).
  // This handler covers Ctrl+C when the agent is processing (not in prompt).
  const sigintHandler = (): void => {
    if (agent.isProcessing) {
      agent.abort();
      console.log(chalk.yellow('\n⏹ Aborted'));
    } else {
      ctrlCCount++;
      if (ctrlCCount >= 2) {
        console.log(chalk.dim('\nGoodbye!'));
        multiLineInput.destroy();
        process.exit(0);
      }
      console.log(chalk.dim('\nPress Ctrl+C again to exit'));
    }
  };
  process.on('SIGINT', sigintHandler);

  const prompt = (): Promise<string> => {
    const indicator = planState.active ? chalk.magenta('[PLAN]> ') : chalk.bold.cyan('❯ ');
    return multiLineInput.prompt(indicator);
  };

  // Display welcome screen with project context
  try {
    const welcomeLines = renderWelcomeScreen(
      process.cwd(),
      agent.config.provider ?? 'anthropic',
      agent.config.model ?? 'default',
    );
    for (const line of welcomeLines) {
      console.log(line);
    }
    console.log();
  } catch {
    // Welcome screen is best-effort; ignore errors
  }

  console.log(chalk.dim('  Alt+Enter for newline, Enter to submit'));
  console.log();

  // Check for recoverable session before entering REPL loop
  try {
    const candidate = detectRecoverableSession();
    if (candidate) {
      console.log(chalk.yellow(formatRecoveryPrompt(candidate)));
      const answer = await new Promise<string>((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('', (ans) => {
          rl.close();
          resolve(ans);
        });
      });
      if (parseRecoveryAnswer(answer)) {
        console.log(chalk.dim('Resuming session...'));
        // The agent's --resume flag handles actual restoration
        // We just signal intent here
      } else {
        console.log(chalk.dim('Starting new session.'));
      }
      console.log();
    }
  } catch {
    // Session recovery is best-effort; ignore errors
  }

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
            // Show API timing stats if available
            const apiStats = agent.apiTimingStats;
            if (apiStats.callCount > 0) {
              const avgMs = apiStats.totalTime / apiStats.callCount;
              console.log(chalk.cyan(`API calls: ${apiStats.callCount}, avg response: ${(avgMs / 1000).toFixed(1)}s`));
            }
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
          case '/help': {
            const commandLines = [
              '/clear    Clear conversation history',
              '/cost     Show token usage and cost',
              '/compact  Compress context',
              '/plan     Enter plan mode',
              '/status   Show session status',
              '/memory   View memory list',
              '/remember Save a memory',
              '/skill    View/run skills',
              '/task     Task management',
              '/help     Show this help',
            ];
            const shortcutLines = [
              'Enter       Submit input',
              'Alt+Enter   Insert newline',
              'Ctrl+C      Abort / double to exit',
              'Ctrl+R      Search history',
              'Tab         File path completion',
            ];
            const box1 = renderBox('Commands', commandLines);
            const box2 = renderBox('Shortcuts', shortcutLines);
            console.log('\n' + box1 + '\n' + box2);
            continue;
          }
          case '/mcp': {
            if (!mcpManager || mcpManager.size === 0) {
              console.log(chalk.dim('No MCP servers connected. Use --mcp flag and configure ~/.code-cli/mcp.json'));
            } else {
              const servers = mcpManager.getConnectedServers();
              console.log(chalk.cyan(`MCP Servers (${servers.length}):`));
              for (const s of servers) {
                console.log(chalk.dim(`  ${s.name} — ${s.toolCount} tools`));
              }
            }
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
                console.log(renderSeparator());
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
                console.log(renderSeparator());
                continue;
              }
              // Check custom skills
              const prompt = getSkillPrompt(skillName);
              if (prompt) {
                console.log(chalk.cyan(`[Skill: ${skillName}]`));
                await agent.chat(prompt);
                console.log(renderSeparator());
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
                console.log(renderSeparator());
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
      console.log(renderSeparator());
    } catch (error) {
      if (error instanceof Error && (error.message === 'readline closed' || error.message === 'input destroyed')) {
        break;
      }
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  multiLineInput.destroy();
  process.removeListener('SIGINT', sigintHandler);
}
