# 实现计划：Mini Claude Code v3 — Phase 8-10

## 概述

v3 升级从 60% 提升到 80% 特性覆盖。任务编号 40-59，延续 v1(1-19) 和 v2(20-39)。

---

## Phase 8: `phase-8/context-and-cache` — 上下文工程深化

- [x] 40. Context Collapse（投影式折叠）
  - [ ] 40.1 实现 ContextCollapse 类 (`src/compactor/collapse.ts`)
    - 维护原始历史和折叠视图两份数据
    - 识别不活跃段（最近 5 轮无引用）并折叠为一行摘要
    - 保持 tool_use/tool_result 配对完整
    - 支持按需展开（工具引用折叠内容时恢复）
    - _需求: 17.1-17.4_
  - [ ] 40.2 集成到压缩管线
    - 插入为第 2.5 级：Snip → Micro → **Collapse** → Auto
    - yield compact 事件 level='collapse'
    - _需求: 17.5, 17.6_
  - [ ] 40.3 为 Context Collapse 编写测试
    - 属性测试 P20: tool_use/tool_result 配对完整性
    - 单元测试：折叠/展开/不活跃段识别
    - _需求: 27_

- [ ] 41. 压缩后自动恢复
  - [ ] 41.1 实现恢复模块 (`src/compactor/recovery.ts`)
    - 从 pre-compression 历史提取最近 5 个编辑过的文件路径
    - 重新读取文件（每个 ≤5K chars），注入为 system-reminder
    - 总量限制 25K chars，文件不存在时跳过
    - _需求: 18.1-18.4_
  - [ ] 41.2 集成到 Auto 压缩流程
    - autoCompact 完成后自动调用 recovery
    - 恢复活跃的 skill 上下文
    - _需求: 18.5_
  - [ ] 41.3 为恢复模块编写测试
    - 属性测试 P21: 文件路径来自 pre-compression 历史
    - 单元测试：文件不存在跳过、总量限制
    - _需求: 27_

- [ ] 42. Prompt Cache 优化
  - [ ] 42.1 实现缓存追踪器 (`src/cache-tracker.ts`)
    - 追踪 cache_read_input_tokens 和 cache_creation_input_tokens
    - 计算命中率，连续 3 次 <50% 时警告
    - _需求: 19.5, 19.6_
  - [ ] 42.2 升级 API 调用层
    - Anthropic provider 设置 cache_control 断点
    - 动态上下文注入为 user message（不在 system prompt 中）
    - _需求: 19.1-19.4_
  - [ ] 42.3 升级 /cost 命令显示缓存命中率
    - _需求: 19.7_
  - [ ] 42.4 为缓存优化编写测试
    - 属性测试 P22: 命中率计算正确性
    - 单元测试：追踪器、警告触发
    - _需求: 27_

- [ ] 43. Phase 8 检查点
  - 确保所有测试通过，`pnpm run check-all` 通过
  - 合并到 master，打标签 `v1.1.0`

---

## Phase 9: `phase-9/skills-and-tasks` — 技能与任务

- [x] 44. 技能系统
  - [ ] 44.1 实现技能存储 (`src/skills/store.ts`)
    - 从 ~/.mini-claude/skills/ 加载 Markdown + YAML frontmatter
    - 懒加载：启动时只读 frontmatter，调用时加载完整内容
    - _需求: 20.1, 20.2, 20.6_
  - [ ] 44.2 实现 3 个内置技能 (`src/skills/builtins/`)
    - commit: 生成 commit message + git commit
    - review: 代码审查当前变更
    - debug: 分析错误 + 建议修复
    - _需求: 20.5_
  - [ ] 44.3 集成到 CLI 和系统提示词
    - /skill_name 手动调用
    - auto 触发技能注入系统提示词
    - 总量限制 5K tokens
    - _需求: 20.3, 20.4, 20.7_
  - [ ] 44.4 为技能系统编写测试
    - 属性测试 P23: 懒加载验证
    - 单元测试：加载/调用/内置技能
    - _需求: 27_

- [ ] 45. 任务管理系统
  - [ ] 45.1 实现任务存储 (`src/tasks/store.ts`)
    - JSON 文件存储到 ~/.mini-claude/tasks/
    - CRUD: createTask/listTasks/claimTask/completeTask
    - 原子 claiming（文件锁）
    - _需求: 21.1-21.5_
  - [ ] 45.2 集成到 CLI
    - /task add <title>、/task list、/task run <id>
    - 执行时 spawn 子 Agent
    - 进度摘要显示
    - _需求: 21.3, 21.6, 21.7_
  - [ ] 45.3 为任务系统编写测试
    - 属性测试 P24: 依赖检查正确性
    - 单元测试：CRUD、依赖、claiming
    - _需求: 27_

- [ ] 46. 并发工具执行增强
  - [ ] 46.1 集成 StreamingToolExecutor 到 query() 循环
    - 替换当前串行执行
    - 流式解析到完整 block 时立即调度
    - _需求: 22.1, 22.2_
  - [ ] 46.2 实现级联中止和执行计时
    - Bash 失败取消兄弟 Bash，不取消 read-only
    - 报告并行收益（wall-clock vs sum）
    - _需求: 22.3-22.5_
  - [ ] 46.3 为并发执行编写测试
    - 属性测试 P25: 级联中止正确性
    - 单元测试：并行/独占/计时
    - _需求: 27_

- [ ] 47. Phase 9 检查点
  - 确保所有测试通过，`pnpm run check-all` 通过
  - 合并到 master，打标签 `v1.2.0`

---

## Phase 10: `phase-10/production-polish` — 生产级打磨

- [ ] 48. Bash AST 安全分析
  - [ ] 48.1 实现命令解析器 (`src/bash-parser.ts`)
    - 结构化 token 树：command/argument/redirect/pipe/subshell
    - 处理引号、转义、变量展开、命令替换
    - 提取实际命令名（忽略 env 前缀）
    - _需求: 23.1-23.4_
  - [ ] 48.2 实现 15 个静态安全检查
    - 系统路径写入、SSH 访问、环境变量操纵、递归操作、网络外泄等
    - 不可解析命令 fail-closed
    - _需求: 23.5, 23.6_
  - [ ] 48.3 为 AST 解析编写测试
    - 属性测试 P26: 命令替换内危险命令检测
    - 单元测试：各种 Bash 语法解析
    - _需求: 27_

- [ ] 49. 扩展工具集
  - [ ] 49.1 实现 web_fetch 工具 (`src/tools/web.ts`)
    - HTTPS only，10s 超时，1MB 限制
    - HTML → 纯文本转换
    - _需求: 24.1-24.3_
  - [ ] 49.2 实现 web_search 工具
    - 可配置搜索 API，返回 top 5 结果
    - isReadOnly + isConcurrencySafe
    - _需求: 24.4-24.6_
  - [ ] 49.3 为 web 工具编写测试
    - 属性测试 P27: HTTPS only 验证
    - 单元测试：超时/限制/格式
    - _需求: 27_

- [ ] 50. 终端 UI 增强
  - [ ] 50.1 实现 Markdown 终端渲染 (`src/markdown.ts`)
    - headers bold、code blocks 高亮、lists 缩进
    - _需求: 25.1_
  - [ ] 50.2 实现 diff 渲染
    - edit_file 调用时显示 git diff 风格输出
    - _需求: 25.2_
  - [ ] 50.3 实现 spinner 状态机
    - 生成中显示 spinner + 已用时间
    - >10s 无新 token 显示 stall 指示
    - --no-color 支持
    - _需求: 25.3-25.5_
  - [ ] 50.4 为 UI 增强编写测试
    - 属性测试 P28: Markdown 渲染幂等性
    - 单元测试：渲染/diff/spinner
    - _需求: 27_

- [ ] 51. npm 发布准备
  - [ ] 51.1 配置 package.json 发布字段
    - name/version/bin/files/engines
    - 排除 src/tests/docs/.env
    - _需求: 26.1-26.3_
  - [ ] 51.2 创建根目录 README.md
    - 项目描述、安装、快速开始、命令、提供商
    - _需求: 26.3_
  - [ ] 51.3 验证 npx 和全局安装
    - _需求: 26.4-26.6_

- [ ] 52. 最终测试与质量门
  - [ ] 52.1 更新 e2e 测试脚本覆盖新功能
    - _需求: 27.3_
  - [ ] 52.2 确保 80%+ 覆盖率
    - _需求: 27.1_
  - [ ] 52.3 确保 check-all 通过
    - _需求: 27.4_

- [ ] 53. Phase 10 检查点 — v2.0.0 最终验证
  - 确保所有测试通过
  - 合并到 master，打标签 `v2.0.0`
  - 更新 docs/ 开发文档

## 说明

- 任务编号 40-53 延续 v1(1-19) 和 v2(20-39)
- 每个 Phase 对应独立 git 分支
- 属性测试引用 design.md 中的 P20-P28
- 每个任务完成后同步更新 docs/
