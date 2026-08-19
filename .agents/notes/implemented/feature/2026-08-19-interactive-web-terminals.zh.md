# Agent Note: Interactive Web terminals

Status: implemented

[English](2026-08-19-interactive-web-terminals.md) | 中文

## Problem

Web UI 可以渲染已完成的终端样式 Tool 结果，却没有人与 PTY 直接交互的路径。复用模型终端操作只会保留逐行规范化的 scrollback 与 send 就绪语义，而交互式程序需要原始字节流、resize、备用缓冲区和持续输入的低延迟。单独运行终端服务器则会重复 Agent 所有权、工作区／沙箱策略、进程清理、Web 信任与身份准入。shell 也没有能在隐藏时保留活动 attachment 的底部区域，右侧 Workbench 则要求 Terminal 保持为独立注册的功能。

## Decision

`dsh-base` 挂载一个 Host `ctx.terminals` 注册表和 `terminal-bash` 后端。该注册表本就按确切拥有者 Agent 对每个会话与清理操作分键，因此所有 preset 都继承一个能力，而无需在 preset 子 realm 中发布服务实例。模型工具仍由 preset 贡献；浏览器使用不会增加 Tool 或模型可见输入。浏览器创建的 PTY 在所选 Session cwd 中启动，请求用户的原生 login shell 及其启动文件和提示符，通过 subprocess terminal type 与子进程环境声明 256 色 truecolor 支持，并使用保留的 `web-bottom-*` 或 `web-right-*` 名称。模型终端会话继续使用配置的受控 shell 与就绪 framing。浏览器传输会在每项 list／open／attach／kill 操作前解析获准的 Session owner，并拒绝附加这些 namespace 之外的会话。

`dsh-client-connection` 公开 effect 拥有且仅限 Host 的 `upgrade()` 注册。它验证精确绝对路径，应用共享 Host／Origin 栅栏和可选身份权威，并把获准身份与原始 request／socket／head 交给协议拥有方。`dsh-terminal-web` 拥有 `/api/terminal`：第一条 JSON 文本帧选择一项操作；活动 socket 使用二进制帧传输 UTF-8 输入与 PTY 输出，并以 JSON 传输 resize／kill／status 控制。输出批处理、payload 上限、握手 deadline、WebSocket 缓冲字节上限、有序 attachment 操作和等待完成的 teardown 共同限制每条连接。独立 socket 可以并发附加同一 PTY：后端会向每个查看方分发 replay 与实时字节、串行执行输入，并把 resize 所有权转移给最近发生交互的查看方，同时保留每个查看方的最新网格以供切换。

`ui-layout` 在中心栏下声明 Session 作用域的 `bottom-panel`。其瞬时 store 控制 280px 首次打开默认值、记忆的 160–520px 拖动高度与 240px 会话区域下限。slot host 关闭后仍以零高度挂载，因此隐藏面板不会终止或分离 shell。`ui-terminal` 注册独立的底部与右侧 Workbench 位置，贡献通用的 PanelBottom Session 标题栏开关，并在两者之间共享浏览器本地外观偏好。其外观编辑器使用共享 modal、紧凑产品菜单与开关，而不是缩放不一致的浏览器原生控件。每个位置持有一个活动 attachment，并保留非活动进程。标签关闭会先移除 UI 状态，再等待 Host 清理；shell 退出会移除同一标签；显式新建和终止操作仍然可用。

xterm 实现改编自 localterm 修订版 `8de7394eb06cf562985d8f82d5a8145863cb8ecd`。其帧感知输出调度器、滚动锚定、按字体探测的连字 joiner、Unicode 宽度修正、patched WebGL 表情符号颜色控制和图像分辨率 patch 保持为一个整体。动态 client bundle 支持由插件生命周期拥有的 `*.global.css` 和从 package 解析的 Fontsource 样式。Fontsource 的 WOFF fallback 会被移除，WOFF2 文件以受 watch 的 data URL 内嵌，因此终端插件无需 sidecar asset route 即可交付完整的 localterm 字体系列菜单。所选字体加载后 xterm 才重新测量 cell，xterm 保留自有且不拉伸的 canvas 尺寸，并在面板过渡期间同时观察内部 surface 与外层 viewport。常驻的已折叠底部 surface 只有在 layout 拥有方达到目标高度后才发布 readiness，因此初始 PTY 分配使用稳定后的网格；渲染后的 screen 仍会被观察，使加载字体宽度变化再次触发 fit，而不会裁掉最右侧列。经过验证的打开网格会从 Web 握手和 terminal capability 传入 PTY 分配；由于 resize 观察可能先于 WebSocket 就绪运行，attachment 后会重放最新拟合网格；所选终端调色板拥有所有 body、xterm、viewport 与 gutter 层。代码显式导入 patched addon 的 ESM artifact，因为每个包的 CommonJS `main` 仍未打 patch。

终端工具栏与面板位置保留 T3 Code 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2` 的归属声明；localterm 与 T3 许可证，以及每个内嵌 Fontsource 字体系列的版权声明和完整 OFL／UFL 文本，都由生成器写入 `THIRD_PARTY_NOTICES.md`。

## Verification

包测试覆盖原生人类 shell 选择、受控模型 shell 保留、本地与 E2B provider 的终端 resize、就绪状态网格重放、多查看方原始 replay／实时输出分发与 resize 切换、精确 Agent 授权、Connection upgrade 信任与清理、WebSocket framing／backpressure、浏览器协议解析、偏好持久化、面板操作、layout resize／让步，以及完整复制的 localterm 输出／连字回归套件。无密钥 Web 浏览器 journey 会启动发货 profile，通过真实底部与右侧 PTY 写入文件，在隐藏和重新打开底部面板时保留 shell 变量，证明隔离的第二个浏览器页面会附加同一 PTY 并观察该变量，修改终端设置，并验证紧凑宽度下的右侧 Sheet 与底部面板行为。普通 build 会机械检查已构建 client bundle，client CSS／纯度测试则覆盖全局 xterm 样式与唯一新增的 terminal protocol 内联例外。

## Alternatives considered

**通过 unary RPC 轮询终端状态。** 轮询可以复用 Typert 调用，却会引入延迟与重复游标，无法提供有序全双工输入／输出，并把 backpressure 变成重复应用请求。

**只在 UI 中暴露模型终端操作。** 这些操作会有意规范化保留输出并等待 shell 就绪。把它们改成交互式传输会削弱面向模型的行为，仍然缺少 resize 与原始备用缓冲区字节。

**把 localterm 作为独立服务或 iframe 运行。** 这可以保留其完整应用，却会重复身份认证、进程所有权、沙箱解析、Session 选择与生命周期清理，也无法作为 Workbench 和底部面板插件组合。

**把终端注册表保留在每个 preset 内。** 子 realm 会阻止 Host Consumer 通过 Agent root 解析 Session 服务，要求每个 preset 重复基础设施行，并使浏览器可用性取决于模型工具组合。一个按确切 Agent 分键的 Host 注册表已经提供所需隔离。

**关闭面板时卸载或终止。** 卸载会丢失终端 replay 状态，并在每次切换时重连；终止则让 layout 手势具有破坏性。保持零高度挂载的 slot 会保留进程与 xterm 状态，同时不占垂直空间。

## Consequences

Web Session 在两个响应式位置获得直接且遵循沙箱策略的终端，不会改变模型请求。终端 provider 新增必需的 resize 操作，终端能力新增原始 attachment 约定。Connection 可以承载其他身份准入的全双工协议，而无需把它们耦合到下行 codec。代价是一个体积较大的独立加载 xterm client bundle、两个固定版本 addon patch、浏览器本地而非 Host 同步的外观偏好、未经压缩的原始终端输出，以及用户遗留运行中持久终端时所需的显式清理。
