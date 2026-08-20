# Agent Note: Web 运行中行仅以高对比中性带 shimmer 文字

Status: implemented

[English](2026-08-20-web-running-row-text-shimmer.md) | 中文

## 问题

对话流中的运行中行——工具行（ToolRow 与 Bash toolview）、Skill 行、Think（推理）行以及通用命令卡片——的运行信号原本是一条扫过整行的固定宽度光带：一个 300px 半透明条带在行内容上方把 `left` 从 -300px 动画到 100%。光带经过时会盖过图标、分隔符与背景，视觉上横跨整个对话列宽度。把扫光首次改为文字裁切 shimmer 时，采用了一档更亮的灰色带（tertiary → secondary），对比太弱，无法读作进行中信号；品牌蓝变体（turn-status 行的配色）也被否决，因为这些行的运行语言保持中性——蓝色是 Deep Diving 的 shimmer 的视觉身份，不属于 harness 对话流。

## 决策

每个运行中行都**只在自己的文字里**承载进行中信号：一个文字裁切（background-clip: text）的中性渐变带，峰值取 `--dsw-alias-label-primary`，两侧是各元素自身的静止色——标题（以及文件链接）用 `--dsw-alias-label-secondary`，摘要与后缀片段用 `--dsw-alias-label-tertiary`。渐变带为 `background-size: 250% 100%`，以 1.4s 线性循环把 `background-position` 从 100% 0 扫到 0 0（`dsh-*-row-text-shimmer` keyframes）。图标、分隔符与行背景保持不动，因此工具身份与行 chrome 静止，只有字形在闪烁。

规则分散在六处、必须保持一致：`ToolRow.module.css` 与 `bash-sample.module.css`（ui-tool）、`SkillRow.module.css`（ui-skill）、`ReasoningRow.module.css` 与 `GenericCommandCard.module.css`（ui-conversation），以及 dsh-codex 仓库 `CodexAssistantStyles.ts` 中的注入样式表——codex 仓库用自己的推理行样式副本渲染 Think 行，因此同样的纯文字处理在那里同步实现（其 markdown 正文规则不动，只改了折叠行标题/摘要的选择器）。`prefers-reduced-motion` 会把每个元素的静止色静态还原；辅助技术状态不变：状态仍由视觉隐藏的运行标签与 `data-state` 属性承载，动画只涉及颜色。

## 曾考虑的替代方案

- **保留整行光带。** 否决：光带经过时会盖过图标与背景，且横跨整个对话宽度，读作嘈杂的 chrome 而非文字信号。
- **一档更亮的灰色带**（摘要 tertiary → secondary）。否决：对比跨度太小，浅色模式下尤其不明显，运行状态难以看清。
- **品牌蓝光带**（turn-status 行的 `--dsw-static-deepseek-500/200` 扫光）。否决：harness 对话行保持中性的运行语言；蓝色是 Deep Diving 的 shimmer 的身份，用户明确不希望照搬。
- **整行调暗 mask**（2026-07-28 之前的实现，见已归档的 [web-conversation-polish-sweep](../../../archived/bug-fix/2026-07-28-web-conversation-polish-sweep.md)）。此前已否决：mask 会调暗整行内容，包括状态点。

## 后果

进行中信号被限定在该行自己的字形内：工具图标保持稳定身份，文字闪烁，行不再覆盖自己的背景。峰值 `label-primary` 给摘要带来两档对比跳变、给标题带来一档跳变——浅色与深色主题下都清晰可见，且不引入色相。代价是每个行渲染器都持有一份规则副本；未来的新行类型（或第三个渲染器仓库）必须同步复刻，任何对运行信号的后续改动都要同时更新这六处。reduced-motion 用户看到静态静止色；动画仍只涉及颜色，读屏行为不变。

## 测试

组件套件固定的是 `data-state` chrome（running/error/stopped）与视觉隐藏标签，本次改动不触碰它们；ui-tool、ui-skill、ui-conversation 与 dsh-codex 渲染器套件全部原样通过。重建后的 bundle 已在实时 GUI 中验证：served 的 ui-tool/ui-skill/ui-conversation/dsh-codex bundle 含 `*-row-text-shimmer` keyframes，且不再有 `*-row-sweep` 规则。
