#!/usr/bin/env node
/**
 * CLI 入口点
 *
 * Code CLI 的主入口文件。负责启动 CLI 应用，
 * 解析命令行参数并初始化 Agent 交互循环。
 *
 * 参考 Claude Code: src/cli.tsx
 * 简化：直接调用 CLI 模块，无 React/Ink 渲染层
 */

// 最早加载 .env 文件，确保后续所有模块都能读到环境变量
import 'dotenv/config';

import chalk from 'chalk';
import { parseArgs, runRepl } from './cli.js';
import { Agent } from './agent.js';
import { validateApiKey, getDefaultModel, getContextWindow } from './provider.js';
import { ConfigurationError } from './errors.js';
import { loadLatestSession } from './session.js';
import { McpManager } from './mcp/index.js';
import { loadConfig, applyConfig, runSetup, getMissingKeyMessage } from './config.js';
import { runInkRepl } from './ink-app/index.js';
import type { ModelMessage } from 'ai';

async function main(): Promise<void> {
  const args = parseArgs();

  // Handle --setup: run interactive setup wizard and exit
  if (args.setup) {
    await runSetup();
    return;
  }

  // Load config from ~/.code-cli/config.json and apply API keys to env
  const config = loadConfig();
  applyConfig(config);

  // Use provider from config file if not explicitly set via --provider
  // (parseArgs defaults to 'anthropic', so we check if user didn't pass --provider)
  if (config.defaultProvider && !process.argv.includes('--provider')) {
    args.provider = config.defaultProvider;
  }

  // Validate provider and API key
  try {
    validateApiKey(args.provider);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(getMissingKeyMessage(args.provider));
      process.exit(1);
    }
    throw error;
  }

  // Resolve model name
  const model = args.model ?? (config.defaultModel || getDefaultModel(args.provider));
  const contextWindow = getContextWindow(args.provider);

  // Create Agent
  const agent = new Agent({
    provider: args.provider as 'anthropic' | 'openai' | 'google' | 'deepseek' | 'zhipu',
    model,
    yolo: args.yolo,
    effectiveContextWindow: contextWindow,
  });

  console.log(chalk.dim(`Provider: ${args.provider} | Model: ${model}`));

  // Handle --coordinator mode
  if (args.coordinator) {
    console.log(chalk.cyan('[COORDINATOR MODE] Agent will orchestrate sub-agents'));
    console.log(chalk.dim('  4-phase workflow: Research → Synthesize → Implement → Verify'));
  }

  // Handle --swarm mode
  if (args.swarm) {
    console.log(chalk.cyan('[SWARM MODE] Multi-agent collaboration enabled'));
    console.log(chalk.dim('  Agents communicate via shared mailbox'));
  }

  // Handle --mcp: initialize MCP servers
  let mcpManager: McpManager | undefined;
  if (args.mcp) {
    mcpManager = new McpManager();
    try {
      await mcpManager.initialize();
      const servers = mcpManager.getConnectedServers();
      if (servers.length > 0) {
        const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);
        console.log(chalk.dim(`MCP: ${servers.length} server(s) connected, ${totalTools} tool(s) available`));
      } else {
        console.log(chalk.dim('MCP: No servers configured or connected'));
      }
    } catch {
      console.log(chalk.dim('MCP: Failed to initialize'));
    }
  }

  // Handle --resume: restore previous session
  if (args.resume) {
    const session = loadLatestSession();
    if (session) {
      agent.restoreMessages(session.messages as ModelMessage[]);
      console.log(chalk.dim(`Resumed session: ${session.id}`));
    } else {
      console.log(chalk.dim('No previous session found.'));
    }
  }

  if (args.prompt) {
    // One-shot mode: execute prompt and exit
    try {
      await agent.chat(args.prompt);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  } else {
    // Interactive REPL mode
    if (args.noInk) {
      // Chalk fallback REPL
      await runRepl(agent, mcpManager);
    } else {
      // Ink React REPL
      await runInkRepl(agent);
    }
  }
}

main().catch((error) => {
  console.error(chalk.red(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
});
