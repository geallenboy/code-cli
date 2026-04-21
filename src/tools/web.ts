/**
 * Web 工具
 *
 * 提供 web_fetch 和 web_search 两个工具，
 * 让 Agent 能获取网页内容和搜索文档。
 *
 * - web_fetch: HTTPS only, 10s 超时, 1MB 限制, HTML → 纯文本
 * - web_search: DuckDuckGo instant answer API (无需 API key)
 *
 * 参考 Claude Code: WebFetchTool + WebSearchTool
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * Fetch a URL and return text content.
 *
 * - Only HTTPS URLs are allowed
 * - 10-second timeout via AbortController
 * - 1MB response size limit
 * - HTML tags stripped for cleaner output
 *
 * @param url - The URL to fetch
 * @returns Plain text content or error message
 */
export async function webFetch(url: string): Promise<string> {
  if (!url.startsWith('https://')) {
    return 'Error: Only HTTPS URLs are allowed';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'gearcode/1.0',
        Accept: 'text/html, text/plain, application/json',
      },
    });

    if (!response.ok) {
      clearTimeout(timeout);
      return `Error: HTTP ${response.status} ${response.statusText}`;
    }

    const text = await response.text();
    clearTimeout(timeout);

    if (text.length > 1_000_000) {
      const truncated = text.slice(0, 1_000_000);
      // Strip HTML tags
      return truncated.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() +
        '\n[truncated to 1MB]';
    }

    // Strip HTML tags for cleaner output
    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === 'AbortError') {
      return `Error fetching ${url}: Request timed out after 10 seconds`;
    }
    return `Error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Search the web using DuckDuckGo instant answer API.
 *
 * Returns formatted results with summary and related topics.
 * No API key needed.
 *
 * @param query - Search query string
 * @returns Formatted search results or error message
 */
export async function webSearch(query: string): Promise<string> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'gearcode/1.0' },
    });

    if (!response.ok) {
      return `Error: Search API returned HTTP ${response.status}`;
    }

    const data = (await response.json()) as {
      AbstractText?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{
        Text?: string;
        FirstURL?: string;
        Topics?: Array<{ Text?: string; FirstURL?: string }>;
      }>;
    };

    const results: string[] = [];

    if (data.AbstractText) {
      results.push(`Summary: ${data.AbstractText}`);
      if (data.AbstractSource && data.AbstractURL) {
        results.push(`Source: ${data.AbstractSource} — ${data.AbstractURL}`);
      }
    }

    if (data.RelatedTopics) {
      let count = 0;
      for (const topic of data.RelatedTopics) {
        if (count >= 5) break;
        if (topic.Text && topic.FirstURL) {
          results.push(`- ${topic.Text}\n  ${topic.FirstURL}`);
          count++;
        }
        // Handle nested topic groups
        if (topic.Topics) {
          for (const sub of topic.Topics) {
            if (count >= 5) break;
            if (sub.Text && sub.FirstURL) {
              results.push(`- ${sub.Text}\n  ${sub.FirstURL}`);
              count++;
            }
          }
        }
      }
    }

    return results.length > 0
      ? results.join('\n\n')
      : `No results found for: ${query}`;
  } catch (e) {
    return `Error searching: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * web_fetch tool definition for AI SDK registration.
 */
export const webFetchTool = tool({
  description:
    'Fetch a URL and return its text content. Only HTTPS URLs are allowed. HTML tags are stripped. Use this to read documentation, API references, or web pages.',
  inputSchema: z.object({
    url: z.string().describe('The HTTPS URL to fetch'),
  }),
  execute: async ({ url }) => webFetch(url),
});

/**
 * web_search tool definition for AI SDK registration.
 */
export const webSearchTool = tool({
  description:
    'Search the web and return top results with titles, URLs, and snippets. Use this to find documentation, examples, or answers to programming questions.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  execute: async ({ query }) => webSearch(query),
});
