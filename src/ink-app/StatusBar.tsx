/**
 * 状态栏组件
 */

import React from 'react';
import { Box, Text } from 'ink';
import { formatTokenCount, formatCost } from '../box.js';

interface StatusBarProps {
  inputTokens: number;
  outputTokens: number;
  elapsed: number;
}

export function StatusBar({ inputTokens, outputTokens, elapsed }: StatusBarProps) {
  const total = inputTokens + outputTokens;
  if (total === 0) return null;

  const tokens = formatTokenCount(total);
  const cost = formatCost((inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15);
  const time = (elapsed / 1000).toFixed(1);

  return (
    <Box justifyContent="center" marginY={0}>
      <Text dimColor>─── {tokens} tokens · {cost} · {time}s ───</Text>
    </Box>
  );
}
