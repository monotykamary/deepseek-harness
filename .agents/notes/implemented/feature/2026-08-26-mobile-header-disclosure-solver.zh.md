# Agent Note: Pretext-measured mobile header disclosure

Status: implemented

[English](2026-08-26-mobile-header-disclosure-solver.md) | 中文

## Problem

聊天上方的会话标题栏（标题面包屑、插槽贡献的操作按钮、面板开关、标签条）没有任何渐进披露：在移动端，栏内的元素会溢出而不是让位。这行用断点是脆弱的，因为两个区带都是插件组合而成的——它们渲染后才知道实际宽度——手工调校的 CSS 断点总会偏离真实文本宽度。

## Decision

`ui-conversation` 中的 `header-layout.ts` 是从 localterm 的 `compute-header-layout.ts` 移植过来的可测试求解内核：三级阶梯（FULL / NO_ACTIONS / TITLE_ONLY）从宽到窄排序，标题面包屑与标签文字用 `@chenglou/pretext` 测量，而不是猜测断点。容器组件用同一个 `ResizeObserver` 同时测量渲染出来的标题栏盒和两个插槽区带，求解器读取测量值（被隐藏的区带保留上一次测量）——不做每条目 32px 的估算。滞回逻辑只在更丰富的层级超出其自身所需宽度再留出余量后才恢复它，因此跨边界的回流不会来回跳动。面包屑的宽度由固定区带让出的空间决定，下限是一个省略号；有标签时标签行始终渲染。

## Alternatives considered

- **单一 CSS 断点折叠。** 任何单一截止点要么在桌面宽列上就收起控件，要么在断点之间让长本地化标签溢出；它无法跟踪插槽拥有的文本。
- **求解器按条目估算宽度。** 插槽按钮不是统一的图标：会话日志控件宽约为开关按钮的三倍，估算要么预留过多空白，要么低估后溢出。
- **标题栏横向滚动。** 把控件藏在用户没有要求的滚动手势后面，并破坏吸顶栏单击即达的设置。

## Consequences

- 标题栏渲染“在实测现实中能放下的最宽一层”的完整区带，因此对齐的行永不溢出；`data-header-tier` 暴露求解出的层级供测试使用。
- 求解偏差只有一帧：区带首次渲染之前宽度未知，渲染后其测量盒进入下一轮求解。
- 求解器是测量输入的纯函数，无需浏览器即可审计。
- 标题栏元素间距仍由父级拥有：区带保持兄弟关系，由行的 flex gap 分隔。

## Testing

`header-layout.client.spec.ts` 在 200–1280px 宽度、对抗性标题和实测完整区带宽度下扫描并断言能放下，断言让位顺序（先操作后工具、标题最后）、对过大实测区带保持诚实，以及围绕真实适配边界的滞回性质；`skeleton.client.spec.tsx` 固化渲染出的层级属性。无密钥的 `conversation-skin` 网页 e2e 在黄金文件中加入移动端标题栏层级与行溢出事实（390px 时层级 1、溢出 0）。

## Related

- [Plan mode narrow-viewport regression](../bug-fix/2026-08-06-plan-narrow-viewport-regression.md) — 本变更取代的更早的移动端行修复。
- localterm `apps/terminal/src/utils/compute-header-layout.ts` — 测量文本模式的上游来源。
