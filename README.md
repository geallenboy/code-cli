# xiaomi-code

A minimal CLI programming agent inspired by Claude Code. Chat with an AI assistant that can read, write, and edit files, run shell commands, search the web, and manage your codebase — all from the terminal.

## Features

- **Multi-provider support** — Anthropic, OpenAI, Google, DeepSeek, and OpenAI-compatible APIs
- **File operations** — Read, write, and edit files with search-and-replace precision
- **Shell execution** — Run commands with dangerous-command detection and user confirmation
- **Web tools** — Fetch URLs and search the web for documentation
- **Context management** — Automatic compaction, session persistence, and prompt caching
- **Memory system** — Persistent project memory across sessions
- **Skills & tasks** — Extensible skill system with task dependency management
- **Security** — Bash AST analysis, 15 static security checks, permission system

## Installation

```bash
# Global install
npm install -g xiaomi-code

# Or run directly with npx
npx xiaomi-code
```

Requires Node.js 18 or later.

## Quick Start

1. Set up your API key:

```bash
export ANTHROPIC_API_KEY=your-key-here
# Or for other providers:
# export OPENAI_API_KEY=your-key-here
# export GOOGLE_GENERATIVE_AI_API_KEY=your-key-here
```

2. Start the agent:

```bash
xiaomi-code
```

3. Chat naturally — ask it to read files, write code, run tests, or search the web.

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/cost` | Display token usage and cost estimate |
| `/compact` | Manually trigger context compaction |
| `/memory` | Show project memory entries |
| `/plan` | Enter plan mode for multi-step tasks |
| `/clear` | Clear conversation history |
| `exit` | Exit the agent |

## Provider Configuration

Set the provider via environment variable or `.env` file:

```bash
# Anthropic (default)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
OPENAI_API_KEY=sk-...
MINI_CLAUDE_PROVIDER=openai

# Google
GOOGLE_GENERATIVE_AI_API_KEY=...
MINI_CLAUDE_PROVIDER=google

# DeepSeek
DEEPSEEK_API_KEY=...
MINI_CLAUDE_PROVIDER=deepseek
```

## CLI Options

```
xiaomi-code [options]

Options:
  --yolo          Skip all confirmation prompts
  --provider <p>  Set the AI provider
  --resume        Resume the last session
  --no-color      Disable color output
  -h, --help      Show help
```

## License

MIT
