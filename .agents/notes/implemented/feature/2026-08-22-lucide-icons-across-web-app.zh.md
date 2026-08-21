# Agent Note: Lucide icons across the web application

Status: implemented

[English](2026-08-22-lucide-icons-across-web-app.md) | 中文

## Problem

Web 应用混用了大量手写 SVG、一次性 SVG、文本符号字形和少量 Lucide 组件。相似操作因此采用不同的几何与描边规则，而更改视觉语言需要修改多个功能包。

## Decision

所有界面图标都使用 `lucide-react`。`@monotykamary/dsh-client-ui-primitives` 持有适配器，保留现有语义组件名称、尺寸、类名和 current-color 行为；功能包消费这些适配器，不再嵌入 SVG 路径。现有直接使用 Lucide 的消费方保持有效。

品牌鲸鱼与 wordmark 继续使用自定义图稿。插画、hero glow、进度／数据可视化和 `StateDot` 不是界面图标，继续保留各自的专用 SVG 渲染。

## Alternatives considered

**保留自定义 SVG，只统一样式。** 共享描边值无法统一几何，也无法消除复制路径数据和一次性字形的维护成本。

**让每个功能包直接导入 Lucide。** 这种方式会让每个包都持有依赖并重复尺寸约定。共享适配器在保留既有 UI API 的同时明确了视觉来源。

**用通用 Lucide 动物替换鲸鱼。** 鲸鱼属于产品身份，而不是界面装饰；替换为通用图标会丢失品牌标记。

## Consequences

应用只交付一个受维护的图标家族，功能代码不再持有图标路径。适配层仍是一层命名间接关系，但它集中管理语义选择，并让现有调用点无需无关 API 改动即可迁移。聚焦的客户端测试和客户端 TypeScript 程序验证共享导出及其消费方。
