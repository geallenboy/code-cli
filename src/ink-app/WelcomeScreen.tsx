/**
 * 欢迎屏幕组件
 */

import React from 'react';
import { Box, Text } from 'ink';
import { detectProjectName, getGitBranch } from '../welcome.js';

interface WelcomeScreenProps {
  provider: string;
  model: string;
}

export function WelcomeScreen({ provider, model }: WelcomeScreenProps) {
  const cwd = process.cwd();
  const { name } = detectProjectName(cwd);
  const branch = getGitBranch(cwd);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginBottom={0}>
      <Text bold>Code CLI</Text>
      <Box>
        <Text>📁 {name}</Text>
        {branch && <Text>  🔀 {branch}</Text>}
      </Box>
      <Text>🤖 {provider} / {model}</Text>
      <Text> </Text>
      <Text dimColor>Enter submit · Alt+Enter newline</Text>
      <Text dimColor>Ctrl+C abort · /help commands</Text>
    </Box>
  );
}
