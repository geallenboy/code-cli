/**
 * Ink REPL 入口
 *
 * 使用 Ink render() 挂载 React 组件树。
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { Agent } from '../agent.js';

/**
 * 启动 Ink REPL
 */
export async function runInkRepl(agent: Agent): Promise<void> {
  const config = agent.config;

  const { waitUntilExit } = render(
    <App agent={agent} config={config} />,
  );

  await waitUntilExit();
}
