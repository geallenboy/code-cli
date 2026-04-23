/**
 * 对话历史消息列表组件
 *
 * 使用虚拟滚动仅渲染可视区域内的消息。
 * 支持搜索高亮（需求 18）。
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useVirtualScroll } from './useVirtualScroll.js';
import { highlightMatches } from './useSearch.js';
import type { ChatMessage } from './types.js';
import type { HighlightSegment } from './useSearch.js';

interface MessageListProps {
  messages: ChatMessage[];
  /** 搜索关键词，非空时高亮匹配文本 */
  searchQuery?: string;
}

/**
 * 渲染带搜索高亮的文本。
 *
 * 需求 18.2：在所有可见消息中高亮显示匹配的关键词
 */
function HighlightedText({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <Text key={i} backgroundColor="yellow" color="black">{seg.text}</Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        ),
      )}
    </>
  );
}

function UserMessage({ content, searchQuery }: { content: string; searchQuery?: string }) {
  const segments = searchQuery ? highlightMatches(content, searchQuery) : null;

  return (
    <Box marginY={0} marginLeft={1}>
      <Text bold color="cyan">&gt; </Text>
      {segments ? <HighlightedText segments={segments} /> : <Text>{content}</Text>}
    </Box>
  );
}

function AssistantMessage({ content, searchQuery }: { content: string; searchQuery?: string }) {
  const segments = searchQuery ? highlightMatches(content, searchQuery) : null;

  return (
    <Box marginY={0} marginLeft={1}>
      {segments ? <HighlightedText segments={segments} /> : <Text>{content}</Text>}
    </Box>
  );
}

function ToolMessage({ message, searchQuery: _searchQuery }: { message: ChatMessage; searchQuery?: string }) {
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

function ErrorMessage({ content, searchQuery }: { content: string; searchQuery?: string }) {
  const segments = searchQuery ? highlightMatches(content, searchQuery) : null;

  return (
    <Box marginLeft={1}>
      {segments ? (
        <>
          {segments.map((seg, i) =>
            seg.isMatch ? (
              <Text key={i} backgroundColor="yellow" color="black">{seg.text}</Text>
            ) : (
              <Text key={i} color="red">{seg.text}</Text>
            ),
          )}
        </>
      ) : (
        <Text color="red">{content}</Text>
      )}
    </Box>
  );
}

export function MessageList({ messages, searchQuery }: MessageListProps) {
  const { visibleItems, startIndex } = useVirtualScroll(messages, {
    estimatedItemHeight: 3,
  });

  return (
    <Box flexDirection="column">
      {startIndex > 0 && (
        <Box marginLeft={1}>
          <Text dimColor>↑ {startIndex} earlier message{startIndex > 1 ? 's' : ''}</Text>
        </Box>
      )}
      {visibleItems.map(msg => {
        switch (msg.role) {
          case 'user':
            return <UserMessage key={msg.id} content={msg.content} searchQuery={searchQuery} />;
          case 'assistant':
            return <AssistantMessage key={msg.id} content={msg.content} searchQuery={searchQuery} />;
          case 'tool':
            return <ToolMessage key={msg.id} message={msg} searchQuery={searchQuery} />;
          case 'error':
            return <ErrorMessage key={msg.id} content={msg.content} searchQuery={searchQuery} />;
          default:
            return null;
        }
      })}
      {messages.length > 0 && visibleItems.length < messages.length - startIndex && (
        <Box marginLeft={1}>
          <Text dimColor>↓ {messages.length - startIndex - visibleItems.length} more message{messages.length - startIndex - visibleItems.length > 1 ? 's' : ''}</Text>
        </Box>
      )}
    </Box>
  );
}
