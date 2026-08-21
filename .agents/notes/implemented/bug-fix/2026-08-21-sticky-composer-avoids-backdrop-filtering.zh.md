# Agent Note: Sticky 编辑器避免 backdrop filter

Status: implemented

[English](2026-08-21-sticky-composer-avoids-backdrop-filtering.md) | 中文

## 问题

活跃编辑器是会话滚动容器的 sticky 子元素。它的 textarea 绘制原生光标，但文字保持透明；对齐的同级 backdrop 绘制可见草稿。某些 Linux Wayland GPU 组合上的 Chromium 会在 transcript 滚动时停止重绘带 filter 的 sticky 子树。此时卡片会在滚动中消失，之后的草稿更新可能只留下首次重绘的字符可见，而透明 textarea 中的其余值仍会正常接收输入。

## 决策

编辑器卡片保留半透明的 color-mix 表面、轮廓、isolation 与阴影，但不应用 `backdrop-filter` 或 `-webkit-backdrop-filter`。sticky 编辑器 seat 的下方纯色带仍位于卡片之后，因此静止时半透明表面不会透出 transcript 文字。去掉 filtered stacking 操作后，浏览器通过普通合成路径绘制 sticky 卡片及其 textarea／backdrop 图层。

会话样式测试会拒绝卡片上的任一 filter 属性。长 Chat 浏览器场景也会在打开已有内容的会话后读取组装态卡片的 computed `backdrop-filter`，并继续覆盖既有的滚动离开与编辑器尺寸变化行为。

## 曾考虑的替代方案

- **保留模糊并强制另一个 compositor layer。** 否决：`will-change`、3D transform 或 paint containment 只会改变图层分配，无法移除依赖驱动的 filtered-sticky 路径；这些提示可能在另一套 GPU 组合上复现同样的丢失。
- **只对 Linux user agent 禁用模糊。** 否决：浏览器身份无法识别 compositor、显卡驱动、Wayland／X11 模式或硬件加速是否启用，而该故障也可能影响其他平台。
- **让 textarea 文字不透明。** 否决：对齐 backdrop 拥有范围颜色与引用图标替换；把完整草稿绘制两次会产生文字毛边并遮住替换后的图标。

## 后果

编辑器失去背景模糊与饱和度效果，但保留半透明 T3 处理。作为交换，可见草稿文字与 sticky 卡片不再依赖 filtered subtree 的重绘。无头 Chromium 无法复现每一种桌面 GPU 路径，因此测试证明的是触发该故障的 CSS 操作已被移除，而不是模拟某个特定 Arch Linux 图形栈。
