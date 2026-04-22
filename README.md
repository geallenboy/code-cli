# Code CLI

A terminal-based AI programming assistant inspired by Claude Code. Chat with an AI that can read, write, and edit your files, run shell commands, search the web, and coordinate multi-agent workflows — all from the command line.

## Features

- **Multi-provider** — Anthropic, OpenAI, Google, DeepSeek, Zhipu (GLM). Switch with a flag.
- **File operations** — Read, write, and edit files with search-and-replace precision. No line-number guessing.
- **Shell execution** — Run commands with 23 static security checks and user confirmation for dangerous operations.
- **Web tools** — Fetch URLs and search the web for docs and references.
- **MCP protocol** — Connect external tools (databases, APIs, K8s) via Model Context Protocol.
- **Multi-agent** — Coordinator mode (orchestrate sub-agents) and Swarm mode (peer-to-peer collaboration).
- **Context management** — 4-level compression pipeline, session persistence, prompt caching.
- **Memory** — Persistent cross-session memory with semantic recall.
- **Plan mode** — Read-only exploration first, then execute with approval.
- **Extended Thinking** — Anthropic thinking chains for complex reasoning tasks.
- **Skills** — Built-in `/commit`, `/review`, `/debug` + custom skills.

## Install

```bash
npm install -g @geallenboy/code-cli
```

Or run directly:

```bash
npx @geallenboy/code-cli
```

Requires Node.js 18+.

## Setup

You need at least one API key. Create a `.env` file in your project root or export the variable:

```bash
# Pick one (or more):
export DEEPSEEK_API_KEY=your-key        # Cheapest, good for most tasks
export ANTHROPIC_API_KEY=sk-ant-...     # Best quality (Claude)
export OPENAI_API_KEY=sk-...            # GPT-4o
export GOOGLE_GENERATIVE_AI_API_KEY=... # Gemini
export ZHIPU_API_KEY=...                # GLM-4 (Chinese)
```

Or copy the template:

```bash
cp .env.example .env
# Edit .env with your key
```

## Usage

### Interactive mode (REPL)

```bash
code-cli                          # Default provider (Anthropic)
code-cli --provider deepseek      # Use DeepSeek
code-cli --provider openai        # Use OpenAI
```

Then just chat:

```
> Read package.json and tell me the version
> Add a "lint" script to package.json
> Run the tests and fix any failures
> Search the codebase for TODO comments
```

### One-shot mode

```bash
code-cli "Read package.json and tell me the version"
code-cli --provider deepseek "Explain what src/index.ts does"
```

### CLI flags

| Flag | Description |
|------|-------------|
| `--provider <name>` | AI provider: `anthropic`, `openai`, `google`, `deepseek`, `zhipu` |
| `--model <name>` | Override the default model (e.g. `gpt-4o-mini`, `claude-haiku-3`) |
| `--yolo` | Skip all confirmation prompts (dangerous commands run without asking) |
| `--resume` | Restore the last session's conversation history |
| `--mcp` | Enable MCP protocol (loads servers from `~/.code-cli/mcp.json`) |
| `--coordinator` | Start in Coordinator mode (orchestrate sub-agents) |
| `--swarm` | Start in Swarm mode (peer-to-peer multi-agent) |
| `--thinking-budget <n>` | Set Extended Thinking token budget (default: 10000, Anthropic only) |
| `--no-thinking` | Disable Extended Thinking |
| `--json` | Request structured JSON output |

### REPL commands

| Command | What it does |
|---------|-------------|
| `/clear` | Clear conversation history |
| `/cost` | Show token usage, cost estimate, and cache hit rate |
| `/compact` | Manually trigger context compression |
| `/plan` | Enter plan mode — agent explores read-only, then you approve the plan |
| `/status` | Show session stats (messages, tokens, plan mode) |
| `/remember <text>` | Save a cross-session memory (auto-classified) |
| `/memory` | List all saved memories |
| `/rules` | Show active permission rules |
| `/mcp` | List connected MCP servers and their tools |
| `/commit` | Generate a commit message and commit (built-in skill) |
| `/review` | Code review current changes (built-in skill) |
| `/debug` | Analyze errors and suggest fixes (built-in skill) |
| `/skill <name>` | Run a custom skill |
| `/task list` | List tasks |
| `/task add <title>` | Create a task |
| `/task run <id>` | Execute a task via sub-agent |
| Ctrl+C | Abort current operation (press twice to exit) |

## Providers

| Provider | Default model | Cost | Best for |
|----------|--------------|------|----------|
| `deepseek` | deepseek-chat | $ | Daily use, good balance of cost and quality |
| `anthropic` | claude-sonnet-4 | $$$ | Best code quality, Extended Thinking support |
| `openai` | gpt-4o | $$ | Good all-around |
| `google` | gemini-2.5-flash | $ | Fast, large context window |
| `zhipu` | glm-4-plus | $ | Chinese language tasks |

## MCP (External Tools)

Connect external tools via the Model Context Protocol. Create `~/.code-cli/mcp.json`:

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "node",
      "args": ["path/to/sqlite-server.js"],
      "env": { "DB_PATH": "/data/mydb.sqlite" }
    },
    "kubernetes": {
      "command": "python",
      "args": ["-m", "k8s_mcp_server"],
      "disabled": false
    }
  }
}
```

Then start with `--mcp`:

```bash
code-cli --mcp
```

MCP tools go through the same permission system as built-in tools.

## Memory

The agent remembers things across sessions. Use `/remember` to save notes:

```
> /remember Always use pnpm, not npm
> /remember Project deadline is 2026-06-01
> /remember Prefer functional style over classes
```

Memories are stored in `~/.code-cli/memory/` as Markdown files and automatically recalled when relevant.

## Plan Mode

For complex tasks, use plan mode to explore first, then execute:

```
> /plan
[PLAN]> Analyze the authentication module and propose a refactoring plan
# Agent explores read-only, generates a plan
# You review and approve/reject/edit the plan
# Agent executes the approved plan with full tool access
```

## Security

The agent checks every shell command against 23 static security rules before execution:

- System path writes (`/etc/`, `/usr/`, `~/.ssh/`)
- Recursive deletes (`rm -rf`)
- Privilege escalation (`sudo`, `su`)
- Network exfiltration (`curl POST`, `wget upload`)
- Git destructive operations (`push --force`, `reset --hard`)
- Docker escape (`--privileged`, `-v /:/host`)
- And 17 more...

In non-yolo mode, dangerous commands require explicit confirmation. The permission system supports allow/deny rules in `~/.code-cli/settings.json`.

## Project Structure

```
~/.code-cli/
├── mcp.json          # MCP server configuration
├── settings.json     # Permission rules
├── memory/           # Cross-session memories
├── sessions/         # Session history
├── skills/           # Custom skills (Markdown)
├── tasks/            # Task management
└── plans/            # Saved plans
```

## Development

```bash
git clone https://github.com/geallenboy/cc-cli.git
cd cc-cli
pnpm install
pnpm run build
pnpm test              # 742 unit tests
pnpm run check-all     # typecheck + lint + test
```

See [docs/README.md](./docs/README.md) for the full development log (15 phases, 67 tasks).

## License

MIT
