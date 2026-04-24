/**
 * 对话历史消息列表组件
 *
 * 使用虚拟滚动仅渲染可视区域内的消息。
 * 支持搜索高亮（需求 18）。
 * 使用 StreamingText、ToolCallPanel、ToolResultPanel 渲染消息。
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useVirtualScroll } from './useVirtualScroll.js';
import { highlightMatches } from './useSearch.js';
import { StreamingText } from './StreamingText.js';
import { ToolCallPanel } from './ToolCallPanel.js';
import { ToolResultPanel } from './ToolResultPanel.js';
import { HelpPanel } from './HelpPanel.js';
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

/**
 * Turn separator — a dim horizontal rule spanning terminal width.
 * Rendered between conversation turns (before a user message that follows
 * an assistant, tool, or error message).
 *
 * 需求 8.1, 8.2, 8.3
 */
function TurnSeparator() {
  const width = process.stdout.columns || 80;
  return (
    <Box marginY={0}>
      <Text dimColor>{'─'.repeat(width)}</Text>
    </Box>
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

function AssistantMessage({ content }: { content: string }) {
  return (
    <Box marginY={0} marginLeft={1}>
      <StreamingText content={content} />
    </Box>
  );
}

function ToolMessage({ message }: { message: ChatMessage }) {
  if (message.elapsed == null) {
    // Tool call in progress — show ToolCallPanel
    return (
      <ToolCallPanel
        toolName={message.toolName ?? 'unknown'}
        input={message.toolInput}
      />
    );
  }
  // Tool completed — show ToolResultPanel
  return (
    <ToolResultPanel
      toolName={message.toolName ?? 'unknown'}
      result={message.content}
      elapsed={message.elapsed}
      isError={message.isError}
    />
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

function SystemMessage({ message }: { message: ChatMessage }) {
  if (message.content === '__HELP_PANEL__') {
    return <HelpPanel />;
  }
  return (
    <Box marginLeft={1}>
      <Text dimColor>{message.content}</Text>
    </Box>
  );
}

/**
 * Determine whether a turn separator should be rendered before the message
 * at the given index in the full messages array.
 *
 * A separator is rendered before a user message when the immediately preceding
 * message has role assistant, tool, or error.
 * No separator before the first message or between consecutive user messages.
 */
export function shouldShowSeparator(messages: ChatMessage[], index: number): boolean {
  if (index <= 0) return false;
  const current = messages[index];
  if (!current || current.role !== 'user') return false;
  const prev = messages[index - 1];
  if (!prev) return false;
  return prev.role === 'assistant' || prev.role === 'tool' || prev.role === 'error' || prev.role === 'system';
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
      {visibleItems.map((msg, i) => {
        const globalIndex = startIndex + i;
        const separator = shouldShowSeparator(messages, globalIndex);

        return (
          <React.Fragment key={msg.id}>
            {separator && <TurnSeparator />}
            {msg.role === 'user' && (
              <UserMessage content={msg.content} searchQuery={searchQuery} />
            )}
            {msg.role === 'assistant' && (
              <AssistantMessage content={msg.content} />
            )}
            {msg.role === 'tool' && (
              <ToolMessage message={msg} />
            )}
            {msg.role === 'error' && (
              <ErrorMessage content={msg.content} searchQuery={searchQuery} />
            )}
            {msg.role === 'system' && (
              <SystemMessage message={msg} />
            )}
          </React.Fragment>
        );
      })}
      {messages.length > 0 && visibleItems.length < messages.length - startIndex && (
        <Box marginLeft={1}>
          <Text dimColor>↓ {messages.length - startIndex - visibleItems.length} more message{messages.length - startIndex - visibleItems.length > 1 ? 's' : ''}</Text>
        </Box>
      )}
    </Box>
  );
}
