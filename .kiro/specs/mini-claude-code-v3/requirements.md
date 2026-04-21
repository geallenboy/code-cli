# 需求文档：Mini Claude Code v3 — Phase 8-10（60% → 80% 特性覆盖）

## 简介

v1.0.0 已覆盖 Claude Code ~60% 特性（384 测试、7 Phase、39 Task）。v3（Phase 8-10）聚焦最高 ROI 的缺失特性，目标达到 80% 特性覆盖。

| Phase | 分支 | 目标 | 预估 |
|-------|------|------|------|
| 8 | `phase-8/context-and-cache` | Context Collapse + 压缩后恢复 + Prompt Cache | 1.5 周 |
| 9 | `phase-9/skills-and-tasks` | 技能系统 + 任务管理 + 并发工具执行增强 | 1.5 周 |
| 10 | `phase-10/production-polish` | Bash AST + 更多工具 + UI 增强 + npm 发布 | 1-2 周 |

---

## Phase 8: 上下文工程深化

### 需求 17：Context Collapse（投影式折叠）

**用户故事：** 作为用户，我希望压缩不会不可逆地丢失对话细节，系统能将不活跃的对话段折叠为摘要视图，需要时可以展开恢复原始内容。

#### 验收标准

1. THE Context_Collapse SHALL maintain two views of the message history: the original complete history and a projected (folded) view sent to the API
2. THE Context_Collapse SHALL identify inactive conversation segments (no tool calls in the last 5 turns referencing content from that segment) and fold them into one-line summaries
3. THE folded view SHALL preserve all tool_use/tool_result pairing integrity
4. WHEN a folded segment is referenced by a subsequent tool call, THE Context_Collapse SHALL unfold that segment to restore full content
5. THE Context_Collapse SHALL be inserted as level 2.5 in the compression pipeline: Snip → Micro → **Collapse** → Auto
6. THE Context_Collapse SHALL track tokens freed and yield a compact event with level 'collapse'

### 需求 18：压缩后自动恢复

**用户故事：** 作为用户，我希望 Auto 压缩后系统能自动重新读取最近编辑的文件，防止模型忘记正在进行的工作。

#### 验收标准

1. WHEN Auto_Compactor completes, THE recovery system SHALL identify the 5 most recently edited file paths from the pre-compression message history
2. THE recovery system SHALL automatically re-read those files (via read_file tool) and inject the content as system-reminder messages
3. THE recovery system SHALL limit total recovery content to 25,000 characters (5 files × 5K each)
4. IF a file no longer exists at recovery time, THE recovery system SHALL skip it without error
5. THE recovery system SHALL also re-inject active skill contexts if any were present before compression

### 需求 19：Prompt Cache 优化

**用户故事：** 作为用户，我希望重复的系统提示词和工具定义能被 API 服务端缓存，减少每次调用的延迟和成本。

#### 验收标准

1. THE Prompt_Orchestrator SHALL divide the API request into cache-stable and cache-volatile sections
2. THE system prompt (role + rules + tool descriptions) SHALL be marked as cache-stable and remain byte-identical across requests within a session
3. THE dynamic context (git status, CLAUDE.md, date) SHALL be injected as the first user message, not in the system prompt
4. WHEN the Anthropic provider is used, THE API caller SHALL set `cache_control: { type: 'ephemeral' }` on the last system prompt block and the last tool definition
5. THE system SHALL track cache hit rate via `cache_read_input_tokens` and `cache_creation_input_tokens` from API responses
6. WHEN cache hit rate drops below 50% for 3 consecutive requests, THE system SHALL log a warning indicating potential cache break
7. THE `/cost` command SHALL display cache hit rate alongside token usage

---

## Phase 9: 技能系统与任务管理

### 需求 20：技能系统（Skills）

**用户故事：** 作为用户，我希望能定义可复用的工作流（如 commit、review、debug），通过斜杠命令或模型自动触发，避免每次重复描述相同的任务。

#### 验收标准

1. THE Skill_System SHALL load skill definitions from `~/.mini-claude/skills/` directory as Markdown files with YAML frontmatter
2. EACH skill file SHALL contain: name, description, trigger (manual/auto/both), and prompt template
3. THE CLI SHALL support `/skill_name` syntax to manually invoke a skill (e.g., `/commit`, `/review`)
4. WHEN a skill is set to auto trigger, THE model SHALL be informed of available skills in the system prompt and may invoke them via tool call
5. THE Skill_System SHALL support 3 built-in skills: `commit` (generate commit message + git commit), `review` (code review current changes), `debug` (analyze error + suggest fix)
6. THE Skill_System SHALL use lazy loading: only frontmatter loaded at startup, full content on invocation
7. THE Skill_System SHALL limit total skill descriptions in the system prompt to 5,000 tokens

### 需求 21：任务管理系统

**用户故事：** 作为用户，我希望能将复杂项目拆分为多个任务，Agent 能追踪进度、按序执行，并在子 Agent 之间协调工作。

#### 验收标准

1. THE Task_System SHALL store tasks as individual JSON files in `~/.mini-claude/tasks/` with one file per task
2. EACH task SHALL contain: id, title, status (pending/in_progress/completed/failed), description, dependencies (task IDs), and result
3. THE CLI SHALL support `/task add <title>` to create a task, `/task list` to show all tasks, `/task run <id>` to execute a task
4. WHEN a task has dependencies, THE Task_System SHALL verify all dependencies are completed before allowing execution
5. THE Task_System SHALL support atomic task claiming via file-level locking to prevent race conditions in multi-agent scenarios
6. WHEN a task is executed, THE Task_System SHALL spawn a sub-agent with the task description and update the task status based on the result
7. THE `/task` command SHALL display a progress summary: N completed / M total

### 需求 22：并发工具执行增强

**用户故事：** 作为用户，我希望多个只读工具调用能真正并行执行，而不是等待 API 流式输出完成后才开始。

#### 验收标准

1. THE StreamingToolExecutor SHALL be integrated into the query() loop, replacing the current serial execution
2. WHEN the API streaming response parses a complete tool_use block, THE executor SHALL immediately dispatch it (not wait for stream end)
3. THE executor SHALL use `Promise.allSettled` for concurrent-safe tools to handle individual failures without blocking others
4. WHEN a Bash tool errors, THE executor SHALL cancel sibling Bash tools (cascading abort) but NOT cancel independent read-only tools
5. THE executor SHALL report execution timing: total wall-clock time vs sum of individual tool times, showing parallelism benefit

---

## Phase 10: 生产级打磨

### 需求 23：Bash AST 安全分析

**用户故事：** 作为用户，我希望 Shell 命令的安全检查能真正理解命令结构（而非正则匹配），准确识别嵌套命令、变量展开和管道中的危险操作。

#### 验收标准

1. THE Shell_Executor SHALL use a proper command parser (shell-quote or custom tokenizer) to parse Bash commands into a structured token tree
2. THE parser SHALL correctly handle: quoted strings, escaped characters, variable expansion ($VAR, ${VAR}), command substitution ($(cmd), `cmd`), and here-documents
3. THE parser SHALL extract the actual command name from each pipeline segment, ignoring env prefixes (e.g., `NODE_ENV=prod node` → command is `node`)
4. THE security checker SHALL evaluate each command in the token tree independently, not just the outer command string
5. THE security checker SHALL implement at least 15 of Claude Code's 23 static checks, including: write to system paths, SSH key access, environment variable manipulation, recursive operations, and network exfiltration
6. THE parser SHALL handle failure gracefully: unparseable commands default to requiring confirmation (fail-closed)

### 需求 24：扩展工具集

**用户故事：** 作为用户，我希望 Agent 能获取网页内容、搜索文档，以便在编程时查阅 API 文档和示例代码。

#### 验收标准

1. THE Tool_Registry SHALL include a `web_fetch` tool that fetches a URL and returns the text content (HTML stripped to plain text)
2. THE `web_fetch` tool SHALL enforce a 10-second timeout and 1MB response size limit
3. THE `web_fetch` tool SHALL only allow HTTPS URLs
4. THE Tool_Registry SHALL include a `web_search` tool that performs a web search and returns top 5 results (title + URL + snippet)
5. THE `web_search` tool SHALL use a configurable search API (default: DuckDuckGo instant answers or similar free API)
6. BOTH web tools SHALL be marked `isReadOnly: true` and `isConcurrencySafe: true`

### 需求 25：终端 UI 增强

**用户故事：** 作为用户，我希望终端输出更加丰富：Markdown 渲染、代码高亮、diff 可视化，以便更好地理解 Agent 的输出。

#### 验收标准

1. THE CLI SHALL render Markdown in the terminal: headers as bold, code blocks with syntax highlighting (using `cli-highlight` or similar), lists with proper indentation
2. THE CLI SHALL render file diffs in git diff format with color coding (green for additions, red for deletions) when edit_file is called
3. THE CLI SHALL display a spinner with status text while the model is generating (replacing the current blank wait)
4. THE spinner SHALL show elapsed time and indicate stall (>10s without new tokens)
5. THE CLI SHALL support `--no-color` flag to disable all color output (for piping to files)

### 需求 26：npm 发布与 CLI 安装

**用户故事：** 作为用户，我希望能通过 `npx mini-claude` 直接使用这个工具，不需要克隆仓库和手动构建。

#### 验收标准

1. THE package.json SHALL be configured for npm publishing with correct `name`, `version`, `bin`, `files`, and `engines` fields
2. THE `bin` entry SHALL point to the compiled CLI entry point with proper shebang
3. THE project SHALL include a root `README.md` with: project description, installation instructions, quick start guide, available commands, and provider configuration
4. WHEN installed globally via `npm install -g mini-claude-code`, THE user SHALL be able to run `mini-claude` from any directory
5. WHEN run via `npx mini-claude-code`, THE tool SHALL work without prior installation
6. THE published package SHALL NOT include: source TypeScript files, test files, docs directory, or .env files

### 需求 27：测试与质量

#### 验收标准

1. THE Project SHALL maintain 80%+ line coverage for all core modules
2. EACH new module SHALL have unit tests + at least one integration test
3. THE e2e test script SHALL be updated to cover new features (skills, tasks, web tools)
4. THE `pnpm run check-all` SHALL pass before each Phase merge
