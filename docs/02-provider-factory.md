# Task 2: AI Provider 工厂

> 对应需求: 12.4, 12.5, 12.6, 12.7, 12.8
> 分支: `phase-1/minimal-skeleton`
> 提交: `aee0b3d`

## 做了什么

实现了 `src/provider.ts` — AI 提供商工厂，通过 Vercel AI SDK 支持多模型提供商。

### 核心函数

**`createModel(provider, model?)`** — 工厂函数的核心

```typescript
// 一行代码切换提供商，这就是统一抽象层的威力
const model = createModel('anthropic');           // → Claude Sonnet
const model = createModel('openai', 'gpt-4o');    // → GPT-4o
const model = createModel('google');              // → Gemini 2.5 Flash
```

内部实现使用 Vercel AI SDK 的 provider 适配器：
```typescript
switch (provider) {
  case 'anthropic': {
    const anthropic = createAnthropic();  // @ai-sdk/anthropic
    return anthropic(modelName);          // 返回统一的 LanguageModel
  }
  case 'openai': {
    const openai = createOpenAI();        // @ai-sdk/openai
    return openai(modelName);
  }
  // ...
}
```

**`validateApiKey(provider)`** — 快速失败检查

启动时立即验证 API Key 是否存在，而不是等到第一次 API 调用才报错。这是一个重要的用户体验设计：

```typescript
// ❌ 不好的体验：用户输入了一大段需求，等了 5 秒，才发现 Key 没设置
// ✅ 好的体验：启动时就告诉用户缺少什么
export function validateApiKey(provider: string): void {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey || apiKey.trim() === '') {
    throw new ConfigurationError(
      `API key not set. Please set the ${config.apiKeyEnv} environment variable.`
    );
  }
}
```

**`PROVIDER_CONFIG`** — 提供商配置映射

```typescript
{
  anthropic: { defaultModel: 'claude-sonnet-4-20250514', apiKeyEnv: 'ANTHROPIC_API_KEY', contextWindow: 200_000 },
  openai:    { defaultModel: 'gpt-4o',                   apiKeyEnv: 'OPENAI_API_KEY',    contextWindow: 128_000 },
  google:    { defaultModel: 'gemini-2.5-flash',         apiKeyEnv: 'GOOGLE_..._KEY',    contextWindow: 1_000_000 },
}
```

## 对应 Claude Code 的概念

Claude Code 使用专用的 `@anthropic-ai/sdk`，与 Claude 模型深度绑定（3,419 行的 `claude.ts`）。这种绑定带来了更好的类型安全和特性支持（如 prompt caching），但也意味着供应商锁定。

Mini 版选择 Vercel AI SDK 的 **provider 适配器模式**：
- 统一的 `LanguageModel` 接口屏蔽了 Anthropic Messages API 和 OpenAI Chat Completions API 的差异
- 切换提供商只需改一个字符串参数
- 代价是失去了一些提供商特有的高级特性（如 Anthropic 的 prompt caching 控制）

**这就是"抽象层"的经典取舍**：通用性 vs 特化能力。

## 测试覆盖

24 个单元测试，覆盖：
- ✅ 三个提供商的配置完整性
- ✅ 默认模型名获取
- ✅ 上下文窗口大小查询
- ✅ API Key 验证（缺失、空字符串、纯空格）
- ✅ 未知提供商的错误处理
- ✅ 模型实例创建（默认模型 + 自定义模型）

```bash
pnpm test  # ✅ 25 tests passed (含 smoke test)
```
