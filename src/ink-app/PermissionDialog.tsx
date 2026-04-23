/**
 * 权限确认对话框组件（Ink 版本）
 *
 * 需求 11：权限确认对话框组件
 *
 * - 渲染带边框的对话框，显示工具名称、风险等级和风险说明
 * - 根据风险等级使用不同颜色：LOW（绿色）、MEDIUM（黄色）、HIGH（红色）
 * - 实现 200ms 防误触延迟，延迟期间选项以 dim 样式渲染且不接受输入
 * - 延迟结束后刷新选项显示为正常亮度并开始接受用户输入
 * - 支持焦点管理，确保键盘输入被正确路由到对话框
 * - 支持 y/n/a 三种选择（yes/no/always），大小写不敏感
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

/** 权限选择类型 */
export type PermissionChoice = 'yes' | 'no' | 'always';

/** 风险等级 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** 默认防误触延迟（毫秒） */
export const ANTI_MISCLICK_DELAY_MS = 200;

/**
 * 根据风险等级返回对应的 Ink 颜色名称。
 *
 * 需求 11.2：LOW（绿色）、MEDIUM（黄色）、HIGH（红色）
 *
 * @param riskLevel - 风险等级
 * @returns Ink 颜色名称
 */
export function getRiskColor(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case 'LOW':
      return 'green';
    case 'MEDIUM':
      return 'yellow';
    case 'HIGH':
      return 'red';
  }
}

/**
 * 解析用户按键为权限选择。
 * 支持 y/n/a，大小写不敏感。
 *
 * 需求 11.6：支持 y/n/a 三种选择（yes/no/always），大小写不敏感
 *
 * @param input - 用户按键字符
 * @returns 权限选择，无效输入返回 null
 */
export function parsePermissionKey(input: string): PermissionChoice | null {
  const key = input.toLowerCase();
  if (key === 'y') return 'yes';
  if (key === 'n') return 'no';
  if (key === 'a') return 'always';
  return null;
}

export interface PermissionDialogProps {
  /** 工具名称 */
  toolName: string;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 风险说明 */
  description: string;
  /** 用户选择回调 */
  onChoice: (choice: PermissionChoice) => void;
  /** 是否激活（控制焦点），默认 true */
  isActive?: boolean;
}

/**
 * 权限确认对话框组件。
 *
 * 需求 11.1：渲染带边框的对话框，显示工具名称、风险等级和风险说明
 * 需求 11.2：根据风险等级使用不同颜色
 * 需求 11.3：实现 200ms 防误触延迟
 * 需求 11.4：延迟结束后刷新选项显示为正常亮度
 * 需求 11.5：支持焦点管理
 * 需求 11.6：支持 y/n/a 三种选择
 */
export function PermissionDialog({
  toolName,
  riskLevel,
  description,
  onChoice,
  isActive = true,
}: PermissionDialogProps) {
  const [ready, setReady] = useState(false);

  // 需求 11.3：200ms 防误触延迟
  useEffect(() => {
    const timer = setTimeout(() => {
      setReady(true);
    }, ANTI_MISCLICK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // 需求 11.5 + 11.6：焦点管理 + 键盘输入处理
  // useInput 的 isActive 参数确保只有当对话框激活时才捕获键盘输入
  const handleInput = useCallback(
    (input: string) => {
      if (!ready) return; // 延迟期间不接受输入
      const choice = parsePermissionKey(input);
      if (choice) {
        onChoice(choice);
      }
    },
    [ready, onChoice],
  );

  useInput(handleInput, { isActive });

  const color = getRiskColor(riskLevel);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={1}
      marginLeft={1}
      width="100%"
    >
      {/* 标题 */}
      <Text color={color} bold>
        ⚠ Permission Required
      </Text>
      <Text> </Text>

      {/* 工具信息 */}
      <Text>
        Tool: <Text bold>{toolName}</Text>
      </Text>
      <Text>
        Risk: <Text color={color} bold>{riskLevel}</Text> — {description}
      </Text>
      <Text> </Text>

      {/* 选项：延迟期间 dim，延迟后正常亮度 */}
      {ready ? (
        <Text>
          <Text color="green" bold>[y]</Text>
          <Text>es  </Text>
          <Text color="red" bold>[n]</Text>
          <Text>o  </Text>
          <Text color="cyan" bold>[a]</Text>
          <Text>lways</Text>
        </Text>
      ) : (
        <Text dimColor>
          [y]es  [n]o  [a]lways
        </Text>
      )}
    </Box>
  );
}
