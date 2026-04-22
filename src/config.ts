/**
 * 配置管理模块
 *
 * 提供 Code CLI 的配置文件读写、交互式设置向导和配置自动加载。
 * 配置文件存储在 ~/.code-cli/config.json，支持多提供商 API Key 管理。
 *
 * 配置加载优先级：
 * 1. 环境变量（最高优先级）
 * 2. ~/.code-cli/config.json
 * 3. .env 文件（由 dotenv 处理）
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as readline from 'node:readline';
import chalk from 'chalk';
import { PROVIDER_CONFIG } from './provider.js';

/** Code CLI 配置结构 */
export interface CodeCliConfig {
  /** 默认提供商 */
  defaultProvider?: string;
  /** 默认模型 */
  defaultModel?: string;
  /** 各提供商的 API Key */
  apiKeys?: Record<string, string>;
}

/** 配置目录路径 */
const CONFIG_DIR = join(homedir(), '.code-cli');

/** 配置文件路径 */
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * 获取配置文件路径（用于测试和显示）
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * 获取配置目录路径
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * 从 ~/.code-cli/config.json 加载配置。
 *
 * 如果文件不存在或解析失败，返回空配置对象。
 *
 * @returns 配置对象
 */
export function loadConfig(): CodeCliConfig {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as CodeCliConfig;
  } catch {
    return {};
  }
}

/**
 * 保存配置到 ~/.code-cli/config.json。
 *
 * 自动创建 ~/.code-cli 目录（如果不存在）。
 *
 * @param config - 要保存的配置对象
 */
export function saveConfig(config: CodeCliConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * 将配置中的 API Key 应用到环境变量。
 *
 * 仅在环境变量尚未设置时才从配置文件加载，
 * 确保环境变量始终具有最高优先级。
 *
 * @param config - 配置对象
 */
export function applyConfig(config: CodeCliConfig): void {
  if (!config.apiKeys) return;

  for (const [providerName, apiKey] of Object.entries(config.apiKeys)) {
    const providerConfig = PROVIDER_CONFIG[providerName];
    if (!providerConfig) continue;

    const envVar = providerConfig.apiKeyEnv;
    // Only set if not already present in environment
    if (!process.env[envVar] || process.env[envVar]?.trim() === '') {
      process.env[envVar] = apiKey;
    }
  }
}

/**
 * 提供商显示信息
 */
interface ProviderInfo {
  name: string;
  displayName: string;
  keyUrl: string;
}

/** 可用提供商列表 */
const PROVIDERS: ProviderInfo[] = [
  { name: 'anthropic', displayName: 'Anthropic (Claude)', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { name: 'openai', displayName: 'OpenAI (GPT-4o)', keyUrl: 'https://platform.openai.com/api-keys' },
  { name: 'google', displayName: 'Google (Gemini)', keyUrl: 'https://aistudio.google.com/apikey' },
  { name: 'deepseek', displayName: 'DeepSeek', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { name: 'zhipu', displayName: 'Zhipu (GLM)', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
];

/**
 * 创建 readline 接口的辅助函数。
 *
 * @returns readline.Interface 实例
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * 使用 readline 提问并获取用户输入。
 *
 * @param rl - readline 接口
 * @param question - 提问文本
 * @returns 用户输入
 */
function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * 运行交互式设置向导。
 *
 * 使用标准 readline（非 raw mode）进行简单的 Q&A 交互：
 * 1. 列出可用提供商
 * 2. 让用户选择默认提供商
 * 3. 提示输入 API Key
 * 4. 保存到 ~/.code-cli/config.json
 * 5. 显示成功信息
 */
export async function runSetup(): Promise<void> {
  const rl = createReadlineInterface();

  try {
    console.log('');
    console.log(chalk.cyan.bold('  Code CLI Setup Wizard'));
    console.log(chalk.dim('  ─────────────────────'));
    console.log('');
    console.log(chalk.dim('  Configure your AI provider and API key.'));
    console.log(chalk.dim('  Config will be saved to: ' + CONFIG_FILE));
    console.log('');

    // Load existing config
    const existingConfig = loadConfig();

    // Step 1: Show available providers
    console.log(chalk.white('  Available providers:'));
    console.log('');
    for (let i = 0; i < PROVIDERS.length; i++) {
      const p = PROVIDERS[i];
      if (!p) continue;
      const isDefault = existingConfig.defaultProvider === p.name;
      const marker = isDefault ? chalk.green(' (current)') : '';
      console.log(chalk.white(`    ${i + 1}) ${p.displayName}${marker}`));
    }
    console.log('');

    // Step 2: Select provider
    const defaultIdx = existingConfig.defaultProvider
      ? PROVIDERS.findIndex((p) => p.name === existingConfig.defaultProvider) + 1
      : 1;
    const providerAnswer = await ask(
      rl,
      chalk.white(`  Select provider [1-${PROVIDERS.length}]`) +
        chalk.dim(` (default: ${defaultIdx}): `),
    );

    const providerIdx = providerAnswer ? parseInt(providerAnswer, 10) - 1 : defaultIdx - 1;
    if (providerIdx < 0 || providerIdx >= PROVIDERS.length) {
      console.log(chalk.red('\n  Invalid selection. Setup cancelled.'));
      return;
    }

    const selectedProvider = PROVIDERS[providerIdx];
    if (!selectedProvider) {
      console.log(chalk.red('\n  Invalid selection. Setup cancelled.'));
      return;
    }
    console.log(chalk.green(`\n  ✓ Selected: ${selectedProvider.displayName}`));

    // Step 3: Get API key
    const providerConfig = PROVIDER_CONFIG[selectedProvider.name];
    const existingKey = existingConfig.apiKeys?.[selectedProvider.name];
    const maskedKey = existingKey ? existingKey.slice(0, 8) + '...' + existingKey.slice(-4) : undefined;

    console.log('');
    if (maskedKey) {
      console.log(chalk.dim(`  Current key: ${maskedKey}`));
    }
    console.log(chalk.dim(`  Get your key at: ${selectedProvider.keyUrl}`));
    console.log(chalk.dim(`  Env variable: ${providerConfig?.apiKeyEnv ?? 'N/A'}`));
    console.log('');

    const keyPrompt = existingKey
      ? chalk.white('  API Key') + chalk.dim(' (press Enter to keep current): ')
      : chalk.white('  API Key: ');
    const apiKeyAnswer = await ask(rl, keyPrompt);

    const apiKey = apiKeyAnswer || existingKey;
    if (!apiKey) {
      console.log(chalk.red('\n  No API key provided. Setup cancelled.'));
      return;
    }

    if (apiKeyAnswer) {
      console.log(chalk.green('  ✓ API key set'));
    } else {
      console.log(chalk.green('  ✓ Keeping existing API key'));
    }

    // Step 4: Save config
    const config: CodeCliConfig = {
      ...existingConfig,
      defaultProvider: selectedProvider.name,
      defaultModel: existingConfig.defaultModel,
      apiKeys: {
        ...existingConfig.apiKeys,
        [selectedProvider.name]: apiKey,
      },
    };

    saveConfig(config);

    // Step 5: Success message
    console.log('');
    console.log(chalk.green.bold('  ✓ Configuration saved!'));
    console.log(chalk.dim(`  File: ${CONFIG_FILE}`));
    console.log('');
    console.log(chalk.white('  Get started:'));
    console.log(chalk.cyan('    code-cli                    ') + chalk.dim('# Interactive mode'));
    console.log(chalk.cyan('    code-cli "fix the bug"      ') + chalk.dim('# One-shot mode'));
    console.log(chalk.cyan('    code-cli --setup            ') + chalk.dim('# Re-run setup'));
    console.log('');
  } finally {
    rl.close();
  }
}

/**
 * 检查是否有任何提供商的 API Key 可用。
 *
 * 按以下顺序检查：
 * 1. 环境变量
 * 2. ~/.code-cli/config.json
 *
 * @returns 是否有可用的 API Key
 */
export function hasAnyApiKey(): boolean {
  // Check environment variables
  for (const config of Object.values(PROVIDER_CONFIG)) {
    const key = process.env[config.apiKeyEnv];
    if (key && key.trim() !== '') {
      return true;
    }
  }

  // Check config file
  const fileConfig = loadConfig();
  if (fileConfig.apiKeys) {
    for (const key of Object.values(fileConfig.apiKeys)) {
      if (key && key.trim() !== '') {
        return true;
      }
    }
  }

  return false;
}

/**
 * 格式化当前配置信息用于 /config 命令显示。
 *
 * @param currentProvider - 当前使用的提供商
 * @param currentModel - 当前使用的模型
 * @returns 格式化的配置信息行数组
 */
export function formatConfigInfo(currentProvider: string, currentModel: string): string[] {
  const config = loadConfig();
  const lines: string[] = [];

  lines.push(chalk.cyan('Current Configuration:'));
  lines.push(chalk.dim(`  Provider: ${currentProvider}`));
  lines.push(chalk.dim(`  Model:    ${currentModel}`));
  lines.push(chalk.dim(`  Config:   ${existsSync(CONFIG_FILE) ? CONFIG_FILE : '(not created)'}`));

  // Show which API keys are configured
  lines.push('');
  lines.push(chalk.cyan('API Keys:'));
  for (const provider of PROVIDERS) {
    const providerCfg = PROVIDER_CONFIG[provider.name];
    if (!providerCfg) continue;

    const envKey = process.env[providerCfg.apiKeyEnv];
    const configKey = config.apiKeys?.[provider.name];

    let status: string;
    if (envKey && envKey.trim() !== '') {
      status = chalk.green('✓ set (env)');
    } else if (configKey && configKey.trim() !== '') {
      status = chalk.green('✓ set (config)');
    } else {
      status = chalk.dim('✗ not set');
    }

    const isActive = provider.name === currentProvider ? chalk.cyan(' ←') : '';
    lines.push(`  ${provider.displayName}: ${status}${isActive}`);
  }

  lines.push('');
  lines.push(chalk.dim('Run code-cli --setup to change configuration'));

  return lines;
}

/**
 * 生成缺少 API Key 时的帮助信息。
 *
 * @param provider - 尝试使用的提供商
 * @returns 帮助信息字符串
 */
export function getMissingKeyMessage(provider: string): string {
  const config = PROVIDER_CONFIG[provider];
  const envVar = config?.apiKeyEnv ?? 'API_KEY';

  const lines = [
    '',
    chalk.red('  No API key found!'),
    '',
    chalk.white('  Set up your API key using one of these methods:'),
    '',
    chalk.cyan('  1. Run the setup wizard:'),
    chalk.white('     code-cli --setup'),
    '',
    chalk.cyan('  2. Set an environment variable:'),
    chalk.white(`     export ${envVar}=your-key-here`),
    '',
    chalk.cyan('  3. Create a .env file in your project:'),
    chalk.white(`     echo "${envVar}=your-key-here" > .env`),
    '',
  ];

  return lines.join('\n');
}
