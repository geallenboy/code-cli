/**
 * 输入组件 — 基于 ink-text-input
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface PromptInputProps {
  onSubmit: (value: string) => void;
  planMode?: boolean;
  disabled?: boolean;
}

export function PromptInput({ onSubmit, planMode, disabled }: PromptInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (input: string) => {
    if (disabled) return;
    const trimmed = input.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue('');
    }
  };

  const prompt = planMode ? '[PLAN]> ' : '> ';

  return (
    <Box marginTop={0}>
      <Text color={planMode ? 'magenta' : 'cyan'} bold>{prompt}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={disabled ? 'Processing...' : ''}
      />
    </Box>
  );
}
