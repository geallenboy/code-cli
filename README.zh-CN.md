# Code CLI

一个终端 AI 编程助手，灵感来自 Claude Code。在命令行中与 AI 对话，它能读写文件、编辑代码、执行命令、搜索网页、协调多 Agent 工作流。

## 特性

- **多模型支持** — Anthropic、OpenAI、Google、DeepSeek、智谱，一个参数切换
- **文件操作** — 读取、写入、精确编辑文件（search-and-replace，不靠行号猜测）
- **命令执行** — 23 项静态安全检查，危险命令需用户确认
- **Web 工具** — 抓取网页、搜索文档和参考资料
- **MCP 协议** — 通过 Model Context Protocol 接入外部工具（数据库、API、K8s）
- **多 Agent** — Coordinator 模式（编排子 Agent）和 Swarm 模式（对等协作）
- **上下文管理** — 4 级压缩管线、会话持久化、提示词缓存
- **记忆系统** — 跨会话持久记忆 + 语义召回
- **计划模式** — 先只读探索，审批后再执行
- **Extended Thinking** — Anthropic 思维链，提升复杂推理能力
- **技能系统** — 内置 `/commit`、`/review`、`/debug` + 自定义技能

## 安装

```bash
npm install -g @geallenboy/code-cli
```

或直接运行：

```bash
npx @geallenboy/code-cli
```

需要 Node.js 18+。

## 配置

至少需要一个 API Key。在项目根目录创建 `.env` 文件或导出环境变量：

```bash
# 选一个（或多个）：
export DEEPSEEK_API_KEY=your-key        # 最便宜，日常够用
export ANTHROPIC_API_KEY=sk-ant-...     # 质量最好（Claude）
export OPENAI_API_KEY=sk-...            # GPT-4o
export GOOGLE_GENERATIVE_AI_API_KEY=... # Gemini
export ZHIPU_API_KEY=...                # GLM-4（中文优化）
```

或复制模板：

```bash
cp .env.example .env
# 编辑 .env 填入你的 Key
```

## 使用

### 交互模式（REPL）

```bash
code-cli                          # 默认提供商（Anthropic）
code-cli --provider deepseek      # 使用 DeepSeek
code-cli --provider openai        # 使用 OpenAI
```

然后直接对话：

```
> 读取 package.json 告诉我版本号
> 给 package.json 加一个 lint 脚本
> 跑一下测试，修复失败的用例
> 搜索代码库里所有的 TODO 注释
```

### 一次性模式

```bash
code-cli "读取 package.json 告诉我版本号"
code-cli --provider deepseek "解释 src/index.ts 做了什么"
```

### 命令行参数

| 参数 | 说明 |
|------|------|
| `--provider <name>` | AI 提供商：`anthropic`、`openai`、`google`、`deepseek`、`zhipu` |
| `--model <name>` | 覆盖默认模型（如 `gpt-4o-mini`、`claude-haiku-3`） |
| `--yolo` | 跳过所有确认提示（危险命令直接执行） |
| `--resume` | 恢复上次会话的对话历史 |
| `--mcp` | 启用 MCP 协议（从 `~/.code-cli/mcp.json` 加载服务器） |
| `--coordinator` | 启动 Coordinator 模式（编排子 Agent） |
| `--swarm` | 启动 Swarm 模式（对等多 Agent 协作） |
| `--thinking-budget <n>` | 设置 Extended Thinking token 预算（默认 10000，仅 Anthropic） |
| `--no-thinking` | 禁用 Extended Thinking |
| `--json` | 请求结构化 JSON 输出 |

### REPL 命令

| 命令 | 功能 |
|------|------|
| `/clear` | 清空对话历史 |
| `/cost` | 显示 token 用量、成本估算、缓存命中率 |
| `/compact` | 手动触发上下文压缩 |
| `/plan` | 进入计划模式 — Agent 只读探索，你审批后再执行 |
| `/status` | 显示会话统计（消息数、token、计划模式状态） |
| `/remember <text>` | 保存跨会话记忆（自动分类） |
| `/memory` | 列出所有已保存的记忆 |
| `/rules` | 显示当前权限规则 |
| `/mcp` | 列出已连接的 MCP 服务器和工具 |
| `/commit` | 生成 commit message 并提交（内置技能） |
| `/review` | 代码审查当前变更（内置技能） |
| `/debug` | 分析错误并建议修复（内置技能） |
| `/skill <name>` | 运行自定义技能 |
| `/task list` | 列出任务 |
| `/task add <title>` | 创建任务 |
| `/task run <id>` | 通过子 Agent 执行任务 |
| Ctrl+C | 中止当前操作（按两次退出） |

## 提供商对比

| 提供商 | 默认模型 | 成本 | 适用场景 |
|--------|----------|------|----------|
| `deepseek` | deepseek-chat | $ | 日常使用，性价比最高 |
| `anthropic` | claude-sonnet-4 | $$$ | 代码质量最好，支持 Extended Thinking |
| `openai` | gpt-4o | $$ | 综合能力强 |
| `google` | gemini-2.5-flash | $ | 速度快，上下文窗口大 |
| `zhipu` | glm-4-plus | $ | 中文任务优化 |

## MCP（外部工具）

通过 Model Context Protocol 接入外部工具。创建 `~/.code-cli/mcp.json`：

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

启动时加 `--mcp`：

```bash
code-cli --mcp
```

MCP 工具和内置工具使用相同的权限系统。

## 记忆系统

Agent 能跨会话记住信息。用 `/remember` 保存：

```
> /remember 项目统一用 pnpm，不用 npm
> /remember 项目截止日期是 2026-06-01
> /remember 代码风格偏好函数式，少用 class
```

记忆存储在 `~/.code-cli/memory/`，相关时自动召回。

## 计划模式

复杂任务先探索再执行：

```
> /plan
[PLAN]> 分析认证模块，提出重构方案
# Agent 只读探索代码库，生成计划
# 你审查并批准/拒绝/编辑计划
# Agent 用完整工具权限执行批准的计划
```

## 安全机制

每条 Shell 命令执行前经过 23 项静态安全检查：

- 系统路径写入（`/etc/`、`/usr/`、`~/.ssh/`）
- 递归删除（`rm -rf`）
- 权限提升（`sudo`、`su`）
- 网络外泄（`curl POST`、`wget upload`）
- Git 破坏性操作（`push --force`、`reset --hard`）
- Docker 逃逸（`--privileged`、`-v /:/host`）
- 还有 17 项更多检查...

非 yolo 模式下，危险命令需要明确确认。权限系统支持在 `~/.code-cli/settings.json` 中配置 allow/deny 规则。

## 目录结构

```
~/.code-cli/
├── mcp.json          # MCP 服务器配置
├── settings.json     # 权限规则
├── memory/           # 跨会话记忆
├── sessions/         # 会话历史
├── skills/           # 自定义技能（Markdown）
├── tasks/            # 任务管理
└── plans/            # 保存的计划
```

## 开发

```bash
git clone https://github.com/geallenboy/cc-cli.git
cd cc-cli
pnpm install
pnpm run build
pnpm test              # 742 个单元测试
pnpm run check-all     # typecheck + lint + test
```

完整开发日志见 [docs/README.md](./docs/README.md)（15 个阶段，67 个任务）。

## 许可证

MIT
