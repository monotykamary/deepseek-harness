# @monotykamary/dsh-client-ui-terminal

[English](README.md) | 中文

该动态 Web 插件会在右侧 Workbench 与 layout 拥有的底部面板中放置交互式 xterm.js 终端。Session 标题栏按钮用于切换常驻底部面板；Workbench 启动器则会打开独立的右侧终端。每个位置只列出自己拥有的持久 Host 会话，在没有运行中会话时创建一个，并在面板关闭后仍保持活动 attachment 挂载。同一个 Host 终端可以由多个浏览器页面查看和控制；输出会到达每个页面，输入活动则会转移共享 PTY 尺寸的所有权。

工具栏提供终端标签、新建、终止、设置、重试和底部面板关闭操作。悬停终端标签时，状态点会替换为关闭控件；键盘焦点会显示相同操作。关闭操作会立即移除标签，同时 Host 在后台继续 teardown；Ctrl+D 等 shell EOF 会通过同一路径移除标签。标题栏使用 PanelBottom 控件，让面板未来可容纳其他内容；终端外观则在共享 modal 中打开，并使用紧凑的产品菜单与开关，而非浏览器原生控件。设置以 `dsh.terminal.preferences.v1` 保存在浏览器本地，并在两个位置之间实时共享：Harness、Tokyo Night、Catppuccin 与浅色调色板；内置的 Geist Mono、Fira Code、JetBrains Mono、Cascadia Code、Source Code Pro、IBM Plex Mono、Ubuntu Mono、Roboto Mono、Inconsolata、Hack 字体或自定义字体系列；字号；行高；按字体探测的连字；彩色表情符号；以及光标闪烁。旧版系统字体偏好会解析为内置 Geist Mono，因此渲染不依赖主机字体。

## 渲染与传输

插件使用 `pnpm-workspace.yaml` 记录的精确 patched xterm WebGL 与 image addon。源自 localterm 的输出调度器会立即解析原始二进制帧、保留用户滚动位置、在已渲染帧边界上调度 DEC 2026 同步输出，并在输入后的有界窗口内直接消费待处理 WebGL render 以降低延迟。WebGL context 丢失时会回退到 xterm 的 DOM renderer。终端会等待所选字体、重新测量 xterm cell，并保留 xterm 自有的 canvas 尺寸而不拉伸。它通过 `ResizeObserver` 重新适配，在底部面板过渡期间观察外层 viewport，并在加载字体度量变化时观察渲染后的 xterm screen，在 attachment 就绪后重放最新网格，使 PTY 使用整个面板，并把后续尺寸发送给 `@monotykamary/dsh-terminal-web`。所选终端调色板统一拥有面板主体、xterm surface、滚动 viewport 与 padding gutter 的背景。

实现与交互模式保留了 [T3 Code 与 localterm 声明](../../../THIRD_PARTY_NOTICES.md#adapted-design-sources)。

## 扩展点

本包占用 `bottom-panel`，在 `workbench.surface` 中注册 `terminal`，并向 `conversation.session.header.utilities` 贡献 `bottom-terminal`。从 Web roster 中移除本包即可停用这三项贡献，而无需修改 layout、Workbench 或终端 Host 服务。

## 模型体验

无，因为该插件是人与 PTY 之间的直接界面，不会改变模型请求或已记录的对话输出。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- 外观偏好只保存在单个浏览器配置中，不会通过 Host 用户设置同步。
- 只有活动标签持有 WebSocket attachment；切换标签会分离上一个终端，但会保留其进程。
- JetBrains Mono、Fira Code 与自定义字体系列必须安装在浏览器所在系统；不可用的选择会回退到系统等宽字体链。
