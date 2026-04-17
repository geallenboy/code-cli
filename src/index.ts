#!/usr/bin/env node
/**
 * CLI 入口点
 *
 * Mini Claude Code 的主入口文件。负责启动 CLI 应用，
 * 解析命令行参数并初始化 Agent 交互循环。
 *
 * 参考 Claude Code: src/cli.tsx
 * 简化：直接调用 CLI 模块，无 React/Ink 渲染层
 */

import chalk from 'chalk';
import { parseArgs, runRepl } from './cli.js';
import { Agent } from './agent.js';
import { validateApiKey, getDefaultModel, getContextWindow } from './provider.js';
import { ConfigurationError } from './errors.js';

async function main(): Promise<void> {
  const args = parseArgs();

  // Validate provider and API key
  try {
    validateApiKey(args.provider);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
    throw error;
  }

  // Resolve model name
  const model = args.model ?? getDefaultModel(args.provider);
  const contextWindow = getContextWindow(args.provider);

  // Create Agent
  const agent = new Agent({
    provider: args.provider as 'anthropic' | 'openai' | 'google',
    model,
    yolo: args.yolo,
    effectiveContextWindow: contextWindow,
  });

  console.log(chalk.dim(`Provider: ${args.provider} | Model: ${model}`));

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
    await runRepl(agent);
  }
}

main().catch((error) => {
  console.error(chalk.red(`Fatal error: ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
});
