# @monotykamary/dsh-client-ui-terminal

[English](README.md) | 中文

该动态 Web 插件会在右侧 Workbench 与 layout 拥有的底部面板中放置交互式 xterm.js 终端。Session 标题栏按钮用于切换常驻底部面板；Workbench 启动器则会打开独立的右侧终端。每个位置只列出自己拥有的持久 Host 会话，在没有运行中会话时创建一个，并在面板关闭后仍保持活动 attachment 挂载。同一个 Host 终端可以由多个浏览器页面查看和控制；输出会到达每个页面，输入活动则会转移共享 PTY 尺寸的所有权。

底部位置把运行中的终端视为通过紧凑树选择的组；新建终端会向活动组添加 pane。右侧位置把每个组直接映射为可重复的外层 Workbench 面板，并依次标记为 Terminal 1、Terminal 2 等；新建终端会创建并选择另一个 Workbench 面板，而不是添加内层终端标签行。水平与垂直拆分操作会向活动组添加最多三个独立 attachment pane；点击 pane 会转移终端焦点和 resize 所有权。关闭或 shell EOF 会移除该 pane，同时 Host 继续 teardown。两个位置都可以扩展到完整 viewport，并在不结束任何 PTY 的情况下恢复原 host。没有 group tree 时，浮动操作组会收起为一个 chevron；hover 或点击会通过 200 ms 的宽度与透明度 transition 展开始终挂载但 inert 的控件，pointer 离开或外部输入会再次收起；reduced-motion 客户端会跳过 transition。每个操作都拥有自己的 separator，因此挂载 hover tooltip 不会改变相邻按钮的位置或宽度。出现 split pane 时，两个位置都会在固定 group 工具栏中保持展开／恢复可见，并采用相同的缩进引导线、轻微 Group pill 与内缩的活动终端行。Host discovery 完成前终端表面保持空白，因此创建或切换右侧 Workbench panel 时不会短暂显示可操作的空状态。标题栏使用 PanelBottom 控件，让面板未来可容纳其他内容；终端外观则在共享 modal 中打开，并使用紧凑的产品菜单与开关，而非浏览器原生控件。终端没有主题选择器：其调色板跟随应用外观（浅色／深色／跟随系统）——外观解析为深色时使用深色 Harness 调色板，否则使用浅色调色板。设置以 `dsh.terminal.preferences.v1` 保存在浏览器本地，并在两个位置之间实时共享：内置的 Geist Mono、Fira Code、JetBrains Mono、Cascadia Code、Source Code Pro、IBM Plex Mono、Ubuntu Mono、Roboto Mono、Inconsolata、Hack 字体或自定义字体系列；字号；行高；按字体探测的连字；彩色表情符号；以及光标闪烁。旧版系统字体偏好会解析为内置 Geist Mono，因此渲染不依赖主机字体。

## 渲染与传输

插件使用 `bun-workspace.yaml` 记录的精确 patched xterm WebGL 与 image addon。源自 localterm 的输出调度器会立即解析普通原始二进制帧；当 Host 在 `output-frame-start` 与 `output-frame-end` 之间包围一次跨越传输尺寸上限的 redraw 时，则会保留这些 transport chunk，并把完整逻辑帧作为一次 xterm parse transaction 提交。它会保留用户滚动位置、在已渲染帧边界上调度 DEC 2026 同步输出，并在输入后的有界窗口内直接消费待处理 WebGL render 以降低延迟。WebGL context 丢失时会回退到 xterm 的 DOM renderer。终端会等待所选字体、重新测量 xterm cell，并保留 xterm 自有的 canvas 尺寸而不拉伸。它通过 `ResizeObserver` 重新适配，在底部面板过渡期间观察外层 viewport，并在加载字体度量变化时观察渲染后的 xterm screen，在 attachment 就绪后重放最新网格，使 PTY 使用整个面板，并把后续尺寸发送给 `@monotykamary/dsh-terminal-web`。所选终端调色板统一拥有面板主体、xterm surface、滚动 viewport 与上／右／下／左尺寸一致的 padding gutter 背景。xterm 会占用宽度的 scrollbar 已禁用；派生自 localterm 的 overlay track 不占用 grid 宽度，只在用户滚离 buffer 底部后出现，并支持 track 翻页与 thumb 拖动。连接建立期间会保持视觉空白，直到 xterm 就绪；只有可操作的连接失败才显示状态文案与重试操作。

实现与交互模式保留了 [T3 Code 与 localterm 声明](../../../THIRD_PARTY_NOTICES.md#adapted-design-sources)。

## 扩展点

本包占用 `bottom-panel`，在 `workbench.surface` 中注册 `terminal`，并向 `conversation.session.header.utilities` 贡献 `bottom-terminal`。从 Web roster 中移除本包即可停用这三项贡献，而无需修改 layout、Workbench 或终端 Host 服务。

## 模型体验

无，因为该插件是人与 PTY 之间的直接界面，不会改变模型请求或已记录的对话输出。

#### KV Cache 影响

无。

## 已知限制与暂缓事项

- Predictive local echo 未启用。浏览器没有任意原生 login shell 的权威 prompt／password 状态，因此 speculative rendering 可能暴露 shell 有意抑制的输入；PTY echo 保持权威。
- 外观偏好只保存在单个浏览器配置中，不会通过 Host 用户设置同步。
- 只有活动组中的 pane 持有 WebSocket attachment；切换组会分离之前的组，但保留所有进程。
- JetBrains Mono、Fira Code 与自定义字体系列必须安装在浏览器所在系统；不可用的选择会回退到系统等宽字体链。
