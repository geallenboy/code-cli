/**
 * 对话历史消息列表组件
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage } from './types.js';

interface MessageListProps {
  messages: ChatMessage[];
}

function UserMessage({ content }: { content: string }) {
  return (
    <Box marginY={0} marginLeft={1}>
      <Text bold color="cyan">&gt; </Text>
      <Text>{content}</Text>
    </Box>
  );
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <Box marginY={0} marginLeft={1}>
      <Text>{content}</Text>
    </Box>
  );
}

function ToolMessage({ message }: { message: ChatMessage }) {
  const icon = message.isError ? '❌' : message.elapsed != null ? '✅' : '⠋';
  const time = message.elapsed != null ? ` (${(message.elapsed / 1000).toFixed(1)}s)` : '';

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <Text color="yellow">{icon} {message.toolName}</Text>
        <Text dimColor>{time}</Text>
      </Box>
      {message.toolInput && (
        <Box marginLeft={2}>
          <Text dimColor>
            {Object.entries(message.toolInput)
              .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
              .join('\n')}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function ErrorMessage({ content }: { content: string }) {
  return (
    <Box marginLeft={1}>
      <Text color="red">{content}</Text>
    </Box>
  );
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column">
      {messages.map(msg => {
        switch (msg.role) {
          case 'user':
            return <UserMessage key={msg.id} content={msg.content} />;
          case 'assistant':
            return <AssistantMessage key={msg.id} content={msg.content} />;
          case 'tool':
            return <ToolMessage key={msg.id} message={msg} />;
          case 'error':
            return <ErrorMessage key={msg.id} content={msg.content} />;
          default:
            return null;
        }
      })}
    </Box>
  );
}
