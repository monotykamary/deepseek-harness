# 运行行改用 motion TextShimmer 扫光条，取代文字裁切渐变

状态：已实施

[English](2026-08-26-web-text-shimmer-motion-band.md) | 中文

## 背景

由 [2026-08-20-web-running-row-text-shimmer](2026-08-20-web-running-row-text-shimmer.zh.md) 引入的文字裁切闪光（`background-clip: text`）每帧都会重建行内每个字形的光栅；多行工具同时流式输出时，同一会话会按帧累积多次重绘，在长会话中表现为持续的 CPU 占用。早先的固定宽度扫光带（`left: -300px → 100%` 扫动，7d5ef1 时代继承）只是一层普通绘制、跑得明显更顺滑，但会扫过整行图标、分隔符与行宽。

## 决策

用 `dsh-client-ui-primitives` 中由 motion 驱动的、仅靠合成器执行的 `TextShimmer` 原子取代六处文本裁切规则。扫光带是绝对定位在行文本盒内的普通渐变条，仅通过 `translateX` 循环变换——每行一层、字形只栅格化一次，扫动范围不出文本框（各行面仅保留 `[data-state='running']` 下的 `position: relative; overflow: hidden` 两条属性）。motion 成为该包的新运行时依赖；`useReducedMotion()` 取代各面的 reduced-motion CSS 块（静态文字、无扫光带）。六处同步表面（ToolRow、bash-sample、SkillRow、ReasoningRow、GenericCommandCard）共用同一原子；Codex 镜像保持自带副本不变。ChatStatus/retry 的闪光不在本次范围。

## 权衡

- 仅做 tail-only 节流：仍逐帧重绘文字，且保留六处复制；否定。
- 纯 CSS 扫光带：单层成本相同，但回到逐面复制，且失去采用 motion 的动机；否定。
- 整行扫光带（原设计）：会扫过图标与背景；改为把扫光带限定在文本框内。

## 影响

运行流保持纯颜色、`aria-hidden`，状态仍由 `data-state` 与视觉隐藏标签表达，与之前一致；reduced-motion 用户看到静态行。浏览器会话新增 motion（约 20 kB gz），同时删除各行的闪光 CSS 块与媒体查询。测试锁定 data-state 表面，本修改未触及；`TextShimmer` 自带 client spec。

## 测试

`pnpm run vitest` 相关包（ui-tool/ui-skill/ui-conversation/ui-primitives，73 文件 1238 用例）通过；`tsc -b tsconfig.client.json` 与 oxlint 干净。实机 GUI 验证：扫光带被限定在文本框内，reduced-motion 下静态。
