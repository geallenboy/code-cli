/**
 * Web 工具单元测试
 *
 * 测试 webFetch 和 webSearch 的核心逻辑。
 * 属性测试 P27: HTTPS only 验证
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import { webFetch, webSearch } from '../../src/tools/web.js';

describe('webFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject non-HTTPS URLs', async () => {
    const result = await webFetch('http://example.com');
    expect(result).toContain('Error: Only HTTPS URLs are allowed');
  });

  it('should reject ftp URLs', async () => {
    const result = await webFetch('ftp://example.com/file');
    expect(result).toContain('Error: Only HTTPS URLs are allowed');
  });

  it('should reject empty URLs', async () => {
    const result = await webFetch('');
    expect(result).toContain('Error: Only HTTPS URLs are allowed');
  });

  it('should fetch HTTPS URLs successfully', async () => {
    const mockResponse = new Response('<html><body>Hello World</body></html>', {
      status: 200,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await webFetch('https://example.com');
    expect(result).toContain('Hello World');
    // HTML tags should be stripped
    expect(result).not.toContain('<html>');
    expect(result).not.toContain('<body>');
  });

  it('should handle HTTP errors', async () => {
    const mockResponse = new Response('Not Found', {
      status: 404,
      statusText: 'Not Found',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await webFetch('https://example.com/missing');
    expect(result).toContain('Error: HTTP 404');
  });

  it('should truncate responses over 1MB', async () => {
    const largeContent = 'x'.repeat(1_100_000);
    const mockResponse = new Response(largeContent, { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await webFetch('https://example.com/large');
    expect(result).toContain('[truncated to 1MB]');
    expect(result.length).toBeLessThan(1_100_000);
  });

  it('should handle fetch errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await webFetch('https://example.com');
    expect(result).toContain('Error fetching');
    expect(result).toContain('Network error');
  });

  it('should strip HTML tags from response', async () => {
    const html = '<div class="content"><p>Hello</p><a href="#">Link</a></div>';
    const mockResponse = new Response(html, { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const result = await webFetch('https://example.com');
    expect(result).not.toContain('<div');
    expect(result).not.toContain('<p>');
    expect(result).toContain('Hello');
    expect(result).toContain('Link');
  });
});

describe('webSearch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return formatted results with abstract', async () => {
    const mockData = {
      AbstractText: 'TypeScript is a programming language',
      AbstractSource: 'Wikipedia',
      AbstractURL: 'https://en.wikipedia.org/wiki/TypeScript',
      RelatedTopics: [
        { Text: 'TypeScript tutorial', FirstURL: 'https://example.com/ts' },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const result = await webSearch('TypeScript');
    expect(result).toContain('Summary: TypeScript is a programming language');
    expect(result).toContain('Wikipedia');
    expect(result).toContain('TypeScript tutorial');
  });

  it('should return "No results" when API returns empty data', async () => {
    const mockData = { RelatedTopics: [] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const result = await webSearch('xyznonexistent');
    expect(result).toContain('No results found');
  });

  it('should limit to 5 results', async () => {
    const topics = Array.from({ length: 10 }, (_, i) => ({
      Text: `Topic ${i}`,
      FirstURL: `https://example.com/${i}`,
    }));
    const mockData = { RelatedTopics: topics };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const result = await webSearch('test');
    // Count the number of "- Topic" occurrences
    const matches = result.match(/- Topic \d/g);
    expect(matches?.length).toBeLessThanOrEqual(5);
  });

  it('should handle fetch errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await webSearch('test');
    expect(result).toContain('Error searching');
  });

  it('should handle HTTP errors from search API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );

    const result = await webSearch('test');
    expect(result).toContain('Error');
  });
});

describe('P27: HTTPS only enforcement (property test)', () => {
  /**
   * **Validates: Requirements 24.3**
   *
   * Property P27: webFetch should reject any URL that does not start with https://
   */
  it('should reject all non-HTTPS URLs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant('http://example.com'),
          fc.constant('ftp://files.example.com'),
          fc.constant('file:///etc/passwd'),
          fc.constant('data:text/html,<h1>hi</h1>'),
          fc.constant('javascript:alert(1)'),
          fc.constant(''),
          fc.constant('not-a-url'),
          fc.stringMatching(/^http:\/\/[a-z]{1,20}\.com$/).filter((s) => s.length > 0),
        ),
        async (url) => {
          const result = await webFetch(url);
          return result.includes('Error: Only HTTPS URLs are allowed');
        },
      ),
      { numRuns: 30 },
    );
  });
});
