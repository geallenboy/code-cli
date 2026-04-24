/**
 * Property-based tests for parseCommand and classifyMemoryType.
 *
 * Uses fast-check to verify universal properties across all valid inputs.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseCommand,
  classifyMemoryType,
  reconstructCommand,
  type CommandDescriptor,
} from '../../src/ink-app/parseCommand.js';

/**
 * Generator for arbitrary CommandDescriptor values.
 * Generates all variants of the discriminated union with appropriate
 * constraints on the data fields.
 */
function arbCommandDescriptor(): fc.Arbitrary<CommandDescriptor> {
  // Non-slash strings for chat — must not start with /
  const chatArb = fc
    .string({ minLength: 0, maxLength: 100 })
    .filter((s) => !s.startsWith('/'))
    .map((text): CommandDescriptor => ({ type: 'chat', text }));

  // Simple commands with no arguments
  const simpleCommands = [
    'clear', 'plan', 'cost', 'compact', 'config',
    'status', 'help', 'memory', 'rules', 'mcp',
    'commit', 'review', 'debug',
  ] as const;
  const simpleArb = fc
    .constantFrom(...simpleCommands)
    .map((type): CommandDescriptor => ({ type }) as CommandDescriptor);

  // /remember with arbitrary text (no leading/trailing whitespace, no internal multi-space)
  const rememberArb = fc
    .string({ minLength: 0, maxLength: 80 })
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .map((text): CommandDescriptor => ({ type: 'remember', text }));

  // /skill (list)
  const skillListArb = fc.constant({ type: 'skill' } as CommandDescriptor);

  // /skill <name> — name must be non-empty, no leading/trailing whitespace
  const skillRunArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter((s) => s.length > 0)
    .map((name): CommandDescriptor => ({ type: 'skill_run', name }));

  // /task (list)
  const taskListArb = fc.constant({ type: 'task_list' } as CommandDescriptor);

  // /task add <title>
  const taskAddArb = fc
    .string({ minLength: 0, maxLength: 80 })
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .map((title): CommandDescriptor => ({ type: 'task_add', title }));

  // /task run <id>
  const taskRunArb = fc
    .string({ minLength: 0, maxLength: 40 })
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .map((id): CommandDescriptor => ({ type: 'task_run', id }));

  // unknown — must start with / and not match any known command
  const unknownArb = fc
    .string({ minLength: 1, maxLength: 40 })
    .map((s) => s.replace(/\s/g, 'x'))
    .filter((s) => {
      // Must not match any known command word
      const known = new Set([
        'clear', 'plan', 'cost', 'compact', 'config',
        'status', 'help', 'memory', 'rules', 'mcp',
        'commit', 'review', 'debug', 'remember', 'skill', 'task',
      ]);
      return !known.has(s) && s.length > 0;
    })
    .map((s): CommandDescriptor => ({ type: 'unknown', raw: `/${s}` }));

  return fc.oneof(
    { weight: 3, arbitrary: chatArb },
    { weight: 3, arbitrary: simpleArb },
    { weight: 2, arbitrary: rememberArb },
    { weight: 1, arbitrary: skillListArb },
    { weight: 2, arbitrary: skillRunArb },
    { weight: 1, arbitrary: taskListArb },
    { weight: 2, arbitrary: taskAddArb },
    { weight: 2, arbitrary: taskRunArb },
    { weight: 2, arbitrary: unknownArb },
  );
}

describe('Property 2: Command parsing round-trip', () => {
  /**
   * **Validates: Requirements 17.2, 17.3, 17.4, 16.1**
   *
   * For any valid CommandDescriptor, calling reconstructCommand(descriptor)
   * to produce a command string and then calling parseCommand on that string
   * SHALL produce a CommandDescriptor equivalent to the original.
   */
  it('parseCommand(reconstructCommand(d)) ≡ d for all descriptors', () => {
    fc.assert(
      fc.property(arbCommandDescriptor(), (descriptor) => {
        const commandString = reconstructCommand(descriptor);
        const parsed = parseCommand(commandString);
        expect(parsed).toEqual(descriptor);
      }),
      { numRuns: 200 },
    );
  });
});

describe('Property 3: Memory type classification by keywords', () => {
  /**
   * **Validates: Requirements 8.3**
   */

  // Keywords for each category
  const userKeywords = ['prefer', 'always', 'never', 'i like', 'i want'];
  const feedbackKeywords = ['instead', 'not', 'use', 'should', 'correct'];
  const projectKeywords = ['deadline', 'release', 'sprint', 'meeting', 'date'];
  const allKeywords = [...userKeywords, ...feedbackKeywords, ...projectKeywords];

  // Base string generator that avoids all keywords
  const safeBaseString = fc
    .string({ minLength: 0, maxLength: 50 })
    .map((s) => {
      // Replace any accidental keyword occurrences
      let result = s.toLowerCase();
      for (const kw of allKeywords) {
        while (result.includes(kw)) {
          result = result.replace(kw, 'zzz');
        }
      }
      return result;
    });

  it('strings with user keywords classify as user', () => {
    fc.assert(
      fc.property(
        safeBaseString,
        fc.constantFrom(...userKeywords),
        (base, keyword) => {
          const text = `${base} ${keyword} ${base}`;
          expect(classifyMemoryType(text)).toBe('user');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('strings with feedback keywords (no user keywords) classify as feedback', () => {
    fc.assert(
      fc.property(
        safeBaseString,
        fc.constantFrom(...feedbackKeywords),
        (base, keyword) => {
          // Ensure no user keywords are present
          const text = `${base} ${keyword} ${base}`;
          const lower = text.toLowerCase();
          const hasUserKeyword = userKeywords.some((k) => lower.includes(k));
          if (hasUserKeyword) return; // skip — base accidentally contains user keyword
          expect(classifyMemoryType(text)).toBe('feedback');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('strings with project keywords (no user/feedback keywords) classify as project', () => {
    fc.assert(
      fc.property(
        safeBaseString,
        fc.constantFrom(...projectKeywords),
        (base, keyword) => {
          const text = `${base} ${keyword} ${base}`;
          const lower = text.toLowerCase();
          const hasHigherKeyword =
            userKeywords.some((k) => lower.includes(k)) ||
            feedbackKeywords.some((k) => lower.includes(k));
          if (hasHigherKeyword) return; // skip
          expect(classifyMemoryType(text)).toBe('project');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('strings with no keywords classify as reference', () => {
    fc.assert(
      fc.property(safeBaseString, (text) => {
        const lower = text.toLowerCase();
        const hasAnyKeyword = allKeywords.some((k) => lower.includes(k));
        if (hasAnyKeyword) return; // skip
        expect(classifyMemoryType(text)).toBe('reference');
      }),
      { numRuns: 100 },
    );
  });

  it('user keywords take priority over feedback keywords', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...userKeywords),
        fc.constantFrom(...feedbackKeywords),
        (userKw, feedbackKw) => {
          const text = `${feedbackKw} and ${userKw}`;
          expect(classifyMemoryType(text)).toBe('user');
        },
      ),
      { numRuns: 50 },
    );
  });

  it('feedback keywords take priority over project keywords', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...feedbackKeywords),
        fc.constantFrom(...projectKeywords),
        (feedbackKw, projectKw) => {
          const text = `${projectKw} and ${feedbackKw}`;
          // Only valid if no user keywords snuck in
          const lower = text.toLowerCase();
          if (userKeywords.some((k) => lower.includes(k))) return;
          expect(classifyMemoryType(text)).toBe('feedback');
        },
      ),
      { numRuns: 50 },
    );
  });
});
