/**
 * Unit tests for parseCommand, classifyMemoryType, and reconstructCommand.
 *
 * Covers all command types with specific examples, edge cases
 * (empty args, extra whitespace, unknown commands), keyword
 * classification, and round-trip reconstruction.
 */

import { describe, it, expect } from 'vitest';
import {
  parseCommand,
  classifyMemoryType,
  reconstructCommand,
  type CommandDescriptor,
} from '../../src/ink-app/parseCommand.js';

describe('parseCommand', () => {
  describe('chat (non-slash input)', () => {
    it('returns chat for plain text', () => {
      expect(parseCommand('hello world')).toEqual({ type: 'chat', text: 'hello world' });
    });

    it('returns chat for empty string', () => {
      expect(parseCommand('')).toEqual({ type: 'chat', text: '' });
    });

    it('returns chat for text that does not start with /', () => {
      expect(parseCommand('fix the bug')).toEqual({ type: 'chat', text: 'fix the bug' });
    });
  });

  describe('simple exact-match commands', () => {
    const simpleCommands = [
      'clear', 'plan', 'cost', 'compact', 'config',
      'status', 'help', 'memory', 'rules', 'mcp',
      'commit', 'review', 'debug',
    ] as const;

    for (const cmd of simpleCommands) {
      it(`parses /${cmd}`, () => {
        expect(parseCommand(`/${cmd}`)).toEqual({ type: cmd });
      });
    }
  });

  describe('/remember', () => {
    it('parses /remember with text', () => {
      expect(parseCommand('/remember always use TypeScript')).toEqual({
        type: 'remember',
        text: 'always use TypeScript',
      });
    });

    it('parses /remember with no text as empty string', () => {
      expect(parseCommand('/remember')).toEqual({ type: 'remember', text: '' });
    });

    it('parses /remember with extra whitespace', () => {
      expect(parseCommand('/remember   some text  ')).toEqual({
        type: 'remember',
        text: 'some text',
      });
    });
  });

  describe('/skill', () => {
    it('parses /skill with no args as skill list', () => {
      expect(parseCommand('/skill')).toEqual({ type: 'skill' });
    });

    it('parses /skill with name as skill_run', () => {
      expect(parseCommand('/skill myskill')).toEqual({ type: 'skill_run', name: 'myskill' });
    });

    it('parses /skill with multi-word name', () => {
      expect(parseCommand('/skill my custom skill')).toEqual({
        type: 'skill_run',
        name: 'my custom skill',
      });
    });
  });

  describe('/task', () => {
    it('parses /task with no args as task_list', () => {
      expect(parseCommand('/task')).toEqual({ type: 'task_list' });
    });

    it('parses /task list as task_list', () => {
      expect(parseCommand('/task list')).toEqual({ type: 'task_list' });
    });

    it('parses /task add with title', () => {
      expect(parseCommand('/task add Fix the login bug')).toEqual({
        type: 'task_add',
        title: 'Fix the login bug',
      });
    });

    it('parses /task add with no title as empty string', () => {
      expect(parseCommand('/task add')).toEqual({ type: 'task_add', title: '' });
    });

    it('parses /task run with id', () => {
      expect(parseCommand('/task run abc123')).toEqual({ type: 'task_run', id: 'abc123' });
    });

    it('parses /task run with no id as empty string', () => {
      expect(parseCommand('/task run')).toEqual({ type: 'task_run', id: '' });
    });

    it('parses /task with unknown subcommand as unknown', () => {
      expect(parseCommand('/task delete 123')).toEqual({
        type: 'unknown',
        raw: '/task delete 123',
      });
    });
  });

  describe('unknown commands', () => {
    it('returns unknown for unrecognized slash command', () => {
      expect(parseCommand('/foobar')).toEqual({ type: 'unknown', raw: '/foobar' });
    });

    it('returns unknown for slash command with args that is not recognized', () => {
      expect(parseCommand('/xyz some args')).toEqual({ type: 'unknown', raw: '/xyz some args' });
    });

    it('returns unknown for simple command with unexpected args', () => {
      // e.g. /clear something — "clear" is a simple command but has args
      expect(parseCommand('/clear something')).toEqual({
        type: 'unknown',
        raw: '/clear something',
      });
    });
  });
});

describe('classifyMemoryType', () => {
  describe('user preferences', () => {
    it('classifies "prefer" keyword as user', () => {
      expect(classifyMemoryType('I prefer tabs over spaces')).toBe('user');
    });

    it('classifies "always" keyword as user', () => {
      expect(classifyMemoryType('always use strict mode')).toBe('user');
    });

    it('classifies "never" keyword as user', () => {
      expect(classifyMemoryType('never use var')).toBe('user');
    });

    it('classifies "i like" keyword as user', () => {
      expect(classifyMemoryType('i like functional programming')).toBe('user');
    });

    it('classifies "i want" keyword as user', () => {
      expect(classifyMemoryType('i want detailed comments')).toBe('user');
    });
  });

  describe('feedback', () => {
    it('classifies "instead" keyword as feedback', () => {
      expect(classifyMemoryType('use map instead of forEach')).toBe('feedback');
    });

    it('classifies "should" keyword as feedback', () => {
      expect(classifyMemoryType('functions should be pure')).toBe('feedback');
    });

    it('classifies "correct" keyword as feedback', () => {
      expect(classifyMemoryType('the correct approach is X')).toBe('feedback');
    });
  });

  describe('project', () => {
    it('classifies "deadline" keyword as project', () => {
      expect(classifyMemoryType('deadline is Friday')).toBe('project');
    });

    it('classifies "release" keyword as project', () => {
      expect(classifyMemoryType('release v2.0 next week')).toBe('project');
    });

    it('classifies "sprint" keyword as project', () => {
      expect(classifyMemoryType('sprint 5 starts Monday')).toBe('project');
    });

    it('classifies "meeting" keyword as project', () => {
      expect(classifyMemoryType('meeting at 3pm')).toBe('project');
    });

    it('classifies "date" keyword as project', () => {
      expect(classifyMemoryType('the date is important')).toBe('project');
    });
  });

  describe('reference (default)', () => {
    it('classifies text with no keywords as reference', () => {
      expect(classifyMemoryType('the API endpoint is /api/v1')).toBe('reference');
    });

    it('classifies empty string as reference', () => {
      expect(classifyMemoryType('')).toBe('reference');
    });
  });

  describe('priority ordering', () => {
    it('user takes priority over feedback', () => {
      // "always" (user) + "should" (feedback)
      expect(classifyMemoryType('you should always test')).toBe('user');
    });

    it('feedback takes priority over project', () => {
      // "should" (feedback) + "deadline" (project)
      expect(classifyMemoryType('should meet the deadline')).toBe('feedback');
    });
  });
});

describe('reconstructCommand', () => {
  it('reconstructs chat', () => {
    expect(reconstructCommand({ type: 'chat', text: 'hello' })).toBe('hello');
  });

  const simpleCommands = [
    'clear', 'plan', 'cost', 'compact', 'config',
    'status', 'help', 'memory', 'rules', 'mcp',
    'commit', 'review', 'debug',
  ] as const;

  for (const cmd of simpleCommands) {
    it(`reconstructs /${cmd}`, () => {
      expect(reconstructCommand({ type: cmd } as CommandDescriptor)).toBe(`/${cmd}`);
    });
  }

  it('reconstructs /remember with text', () => {
    expect(reconstructCommand({ type: 'remember', text: 'some note' })).toBe('/remember some note');
  });

  it('reconstructs /remember with empty text', () => {
    expect(reconstructCommand({ type: 'remember', text: '' })).toBe('/remember');
  });

  it('reconstructs /skill (list)', () => {
    expect(reconstructCommand({ type: 'skill' })).toBe('/skill');
  });

  it('reconstructs /skill run', () => {
    expect(reconstructCommand({ type: 'skill_run', name: 'myskill' })).toBe('/skill myskill');
  });

  it('reconstructs /task (list)', () => {
    expect(reconstructCommand({ type: 'task_list' })).toBe('/task');
  });

  it('reconstructs /task add', () => {
    expect(reconstructCommand({ type: 'task_add', title: 'Fix bug' })).toBe('/task add Fix bug');
  });

  it('reconstructs /task add with empty title', () => {
    expect(reconstructCommand({ type: 'task_add', title: '' })).toBe('/task add');
  });

  it('reconstructs /task run', () => {
    expect(reconstructCommand({ type: 'task_run', id: 'abc' })).toBe('/task run abc');
  });

  it('reconstructs /task run with empty id', () => {
    expect(reconstructCommand({ type: 'task_run', id: '' })).toBe('/task run');
  });

  it('reconstructs unknown', () => {
    expect(reconstructCommand({ type: 'unknown', raw: '/foobar' })).toBe('/foobar');
  });
});
