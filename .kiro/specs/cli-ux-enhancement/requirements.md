# 需求文档：CLI 用户体验增强

## 简介

Code CLI 是一个 v3.0.0 的 AI 编程 Agent，核心架构已成熟（90%+ 特性覆盖），但用户交互层仍处于原型阶段。当前终端输出使用 `chalk` 的纯绿色文本，输入仅支持单行 `readline`，文件编辑无可视化 diff。本需求按三个优先级层次（P0 核心体验、P1 体验提升、P2 锦上添花）增强 CLI 用户体验，目标接近 Claude Code 的交互质量。

现有代码基础：`src/ui.ts`（纯函数 + chalk）、`src/cli.ts`（readline REPL）、`src/markdown.ts`（基础 ANSI Markdown 渲染器）、`src/ink/`（组件系统，尚未集成到主 REPL）。本 spec 在这些基础上构建。

## 术语表

- **REPL**：`src/cli.ts` 中的交互式读取-求值-输出循环，接受用户输入并分发给 Agent
- **Markdown_Renderer**：负责将 Markdown 文本转换为 ANSI 格式化终端输出的模块，当前为 `src/markdown.ts`
- **Diff_Renderer**：负责在终端中以红绿 git-diff 风格渲染文件变更的模块
- **Input_Handler**：管理 REPL 中用户键盘输入的模块，包括多行编辑和快捷键绑定
- **Permission_Dialog**：提示用户确认或拒绝工具执行的 UI 组件，当前在 `src/ink/components/permission-dialog.ts`
- **Tool_Result_Renderer**：负责格式化和显示工具执行结果的模块
- **Retry_Display**：负责在临时 API 错误（HTTP 429/503）期间显示重试进度的模块
- **Spinner**：模型处理期间显示的加载动画指示器，当前在 `src/ui.ts`
- **Tab_Completer**：按 Tab 键时提供文件路径自动补全的模块
- **History_Search**：提供 Ctrl+R 反向搜索输入历史的模块
- **Session_Recovery**：检测未完成的上次会话并提示用户恢复的模块
- **Welcome_Screen**：在 REPL 启动时显示项目上下文和状态的模块
- **StreamEvent**：`query()` generator 发出的类型化联合事件，定义在 `src/types.ts`
- **Anti_Misclick_Delay**：权限确认输入被接受前的 200ms 延迟，防止误触批准

---

## 需求

### 需求 1：流式 Markdown 渲染（P0）

**用户故事：** 作为使用 Code CLI 的开发者，我希望 AI 助手的流式输出能渲染 Markdown 格式（语法高亮的代码块、加粗标题、缩进列表），这样我能阅读结构化的响应而不是纯绿色文本。

#### 验收标准

1. 当 Agent 流式输出包含带语言标识的围栏代码块时，Markdown_Renderer 应使用对应语言的语法高亮渲染代码块内容
2. 当 Agent 流式输出包含 Markdown 标题（以 `#`、`##` 或 `###` 开头的行）时，Markdown_Renderer 应使用加粗和/或下划线 ANSI 格式渲染标题，与正文可区分
3. 当 Agent 流式输出包含 Markdown 加粗语法（`**文本**`）时，Markdown_Renderer 应使用 ANSI 加粗格式渲染被包裹的文本
4. 当 Agent 流式输出包含 Markdown 列表项（以 `-` 或 `*` 开头的行）时，Markdown_Renderer 应使用一致的缩进和项目符号渲染列表项
5. 当 Agent 流式输出包含行内代码（`` `文本` ``）时，Markdown_Renderer 应使用与周围文本视觉上可区分的样式渲染
6. 当 Agent 逐 token 增量流式输出时，Markdown_Renderer 应实时渲染每个 token，不等待完整响应，并在 token 边界间维护正确的格式化状态
7. 如果终端不支持 256 色或 TrueColor，Markdown_Renderer 应回退到基础 ANSI 颜色码（16 色），不产生乱码

### 需求 2：文件编辑 Diff 渲染（P0）

**用户故事：** 作为使用 Code CLI 的开发者，我希望在 Agent 编辑文件时看到红绿 git-diff 风格的视图，这样我能准确理解改了什么。

#### 验收标准

1. 当 `edit_file` 工具完成文件修改时，Diff_Renderer 应以 git-diff 风格显示变更，删除行红色、新增行绿色
2. 当 Diff_Renderer 显示 diff 时，应包含旧内容和新内容的行号
3. 当 Diff_Renderer 显示 diff 时，应显示上下文行（变更周围的未修改行）提供位置参考
4. 当 `write_file` 工具创建新文件时，Diff_Renderer 应将所有行显示为绿色新增
5. 如果 diff 输出超过 80 行，Diff_Renderer 应截断显示并展示新增和删除总数的摘要

### 需求 3：多行输入（P0）

**用户故事：** 作为使用 Code CLI 的开发者，我希望用 Alt+Enter 输入换行来编写多行 prompt，这样我能编写包含代码片段和结构化指令的复杂提示。

#### 验收标准

1. 当用户在 REPL 输入中按 Alt+Enter 时，Input_Handler 应在当前输入缓冲区插入换行符而不是提交输入
2. 当用户在 REPL 输入中按 Enter（不带 Alt）时，Input_Handler 应将完整的多行输入缓冲区提交给 Agent
3. 当用户正在编写多行输入时，Input_Handler 应在后续行显示续行指示符（如 `...`）以区分首行
4. 当用户正在编写多行输入时，Input_Handler 应支持光标导航（方向键）跨所有输入行
5. 如果用户在编写多行输入时按 Ctrl+C，Input_Handler 应清空整个输入缓冲区并返回新的提示符

### 需求 4：权限确认增强（P1）

**用户故事：** 作为使用 Code CLI 的开发者，我希望权限确认对话框有防误触延迟、风险等级颜色和建议规则显示，这样我能做出知情决策并避免意外批准危险操作。

#### 验收标准

1. 当工具需要权限确认时，Permission_Dialog 应强制执行 200ms Anti_Misclick_Delay，在此期间不接受任何键盘输入，防止快速按键导致的意外批准
2. 当工具需要权限确认时，Permission_Dialog 应显示风险等级（LOW、MEDIUM、HIGH），颜色编码：LOW 绿色、MEDIUM 黄色、HIGH 红色
3. 当工具需要权限确认且有可用的建议权限规则时，Permission_Dialog 应显示建议规则文本，让用户决定是否创建永久允许规则
4. 当 Anti_Misclick_Delay 生效期间，Permission_Dialog 应提供视觉指示（如变暗或禁用外观）表明输入尚未被接受

### 需求 5：工具结果增强（P1）

**用户故事：** 作为使用 Code CLI 的开发者，我希望工具结果显示代码语法高亮和文件内容行号，这样我能快速理解工具输出而无需心理解析。

#### 验收标准

1. 当工具结果包含代码内容（来自 `read_file` 或 `grep_search`）时，Tool_Result_Renderer 应根据文件扩展名使用语法高亮显示内容
2. 当工具结果包含文件内容时，Tool_Result_Renderer 应在每行内容旁显示行号
3. 当工具结果超过 50 行时，Tool_Result_Renderer 应显示前 30 行和最后 10 行，中间显示可折叠指示器标明隐藏行数
4. 当工具结果包含文件路径时，Tool_Result_Renderer 应使用与结果内容视觉上可区分的样式渲染路径

### 需求 6：重试进度显示（P1）

**用户故事：** 作为使用 Code CLI 的开发者，我希望在临时 API 错误期间看到重试进度，这样我知道系统正在恢复以及还剩多少次尝试。

#### 验收标准

1. 当发生可重试的 API 错误（HTTP 429 或 503）时，Retry_Display 应显示格式为"重试中 (N/M)..."的进度消息，N 为当前尝试次数，M 为最大重试次数
2. 当发生可重试的 API 错误时，Retry_Display 应显示下次重试前的预计等待时间
3. 当所有重试尝试用尽时，Retry_Display 应显示清晰的错误消息，指明失败原因和总尝试次数
4. 当重试等待进行中时，Retry_Display 应更新倒计时器显示剩余等待时间

### 需求 7：Spinner 模式增强（P1）

**用户故事：** 作为使用 Code CLI 的开发者，我希望 Spinner 能视觉上区分请求中、思考中和响应中状态，这样我能理解系统在每个时刻正在做什么。

#### 验收标准

1. 当系统等待第一个 API 响应 token 时，Spinner 应以"请求中"模式显示，使用快速动画（约 50ms/帧）和标签如"请求中..."
2. 当系统接收模型的思考/推理 token 时，Spinner 应以"思考中"模式显示，使用较慢动画（约 200ms/帧）和标签如"思考中..."
3. 当系统接收模型的文本响应 token 时，Spinner 应以"响应中"模式显示，使用标准动画和标签如"响应中..."
4. 当 Spinner 超过 10 秒未收到新 token 时，应将颜色渐变为警告色（黄色或红色）指示可能的停滞

### 需求 8：Tab 文件路径补全（P2）

**用户故事：** 作为使用 Code CLI 的开发者，我希望按 Tab 自动补全输入中的文件路径，这样我能快速引用项目文件而无需输入完整路径。

#### 验收标准

1. 当用户在 REPL 输入中输入部分文件路径时按 Tab，Tab_Completer 应显示当前工作目录中匹配的文件和目录名列表
2. 当恰好一个文件路径匹配部分输入时，Tab_Completer 应内联自动补全路径而不显示列表
3. 当多个文件路径匹配部分输入时，Tab_Completer 应补全公共前缀并显示剩余选项
4. 当用户在已补全的目录路径上按 Tab 时，Tab_Completer 应列出该目录的内容

### 需求 9：Ctrl+R 历史搜索（P2）

**用户故事：** 作为使用 Code CLI 的开发者，我希望按 Ctrl+R 搜索输入历史，这样我能快速回忆和复用之前的 prompt。

#### 验收标准

1. 当用户在 REPL 中按 Ctrl+R 时，History_Search 应进入反向搜索模式并显示搜索提示
2. 在反向搜索模式中，History_Search 应随用户输入搜索字符增量过滤输入历史，显示最近的匹配条目
3. 当用户在反向搜索模式中按 Enter 时，History_Search 应将选中的历史条目放入输入缓冲区供编辑或提交
4. 当用户在反向搜索模式中再次按 Ctrl+R 时，History_Search 应循环到下一个更旧的匹配条目
5. 如果用户在反向搜索模式中按 Escape，History_Search 应退出搜索模式并恢复之前的输入缓冲区

### 需求 10：自动会话恢复提示（P2）

**用户故事：** 作为使用 Code CLI 的开发者，我希望启动时自动提示恢复未完成的上次会话，这样我能从上次中断处继续而无需记住使用 `--resume`。

#### 验收标准

1. 当 Code CLI 以交互模式启动且存在未完成的上次会话时，Session_Recovery 应显示提示询问用户是否恢复上次会话
2. 当用户确认会话恢复时，Session_Recovery 应恢复上次会话的消息历史并从中断处继续
3. 当用户拒绝会话恢复时，Session_Recovery 应启动新会话
4. Session_Recovery 应将"未完成"定义为上次会话未通过用户主动退出（双击 Ctrl+C 或 `/exit` 命令）结束

### 需求 11：欢迎屏幕与项目上下文（P2）

**用户故事：** 作为使用 Code CLI 的开发者，我希望启动时看到显示项目上下文（名称、语言、最近 git 活动）的欢迎屏幕，这样我能立即获得情境感知。

#### 验收标准

1. 当 Code CLI 以交互模式启动时，Welcome_Screen 应显示从 `package.json`、`Cargo.toml`、`pyproject.toml` 或当前目录名推导的项目名称
2. 当 Code CLI 以交互模式启动且检测到 git 仓库时，Welcome_Screen 应显示当前分支名和未提交变更数量
3. 当 Code CLI 以交互模式启动时，Welcome_Screen 应显示当前使用的提供商和模型名称
4. Welcome_Screen 应在 200ms 内完成渲染，避免延迟首次输入提示
