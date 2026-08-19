# @monotykamary/dsh-client-ui-workbench

[English](README.md) | 中文

供独立注册的 Session 界面使用的标签式右侧面板宿主。该插件占用 layout 的 `details` slot、声明可叠加的 `workbench.surface` 列表，并提供 `ctx.workbench.show()`、`open(id)`、`openNew(id)`、`ensureCount(id, count)`、`close()` 及 effect 可清理的呈现注册。界面注册项提供稳定 `id`、顺序、跟随 locale 的标签、组件，以及它拥有的子 slot 或 store；打开未注册的品牌化 `WorkbenchSurfaceId` 会明确失败。移除界面注册项时，同一声明生命周期会移除其标签页。

已打开的面板 instance 与活动面板 id 保存在每 Session 的临时 entry store 中。单例界面会复用现有面板；可重复界面可以创建多个带稳定且会复用空缺序号的面板，而每个 instance 仍通过同一个静态插件注册渲染。`show()` 会显示空面板，其居中卡片列出全部已注册界面；选择卡片会追加并激活该界面。关闭生效中的标签页会选择相邻的剩余项，关闭最后一个标签页则回到启动器而不隐藏面板；关闭面板会保留其标签集合。每个标签页显示所注册的图标，并在悬停或键盘聚焦时于同一位置换成关闭图标。界面可声明 immersive chrome：当它是唯一已打开界面时，其组件拥有顶部行；打开另一界面会恢复通用 Workbench 标签，使跨界面导航保持可用。指针选择与 Left／Right／Home／End 键盘导航使用同一激活动作。

Layout 提供 Details 承载模式。三栏让步求解器能够保留中心栏下限时，Workbench 填充可调整宽度的内联栏。明确打开的 Details 偏好若求解为零内联宽度，同一个已挂载 Workbench 会通过共享的右侧 `Sheet` portal；关闭任一宿主都写入唯一的 layout 关闭动作。切换 Session 仍会在绘制前关闭 Details，而每个驻留 Session 的 store 会保留自身标签页。

发货的 Web 组合由 [`ui-conversation`](../ui-conversation/README.md) 注册 **Inspect**，由 [`ui-deliverables`](../ui-deliverables/README.md) 注册 **Changes**，并由 [`ui-files`](../ui-files/README.md) 注册 **Files**；[Workbench Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-web-ui-workbench.md)负责包拆分。Inspect 共享 conversation store，Changes 读取自己的增量 Conversation target，Files 则通过其 Session 授权的 Host Remote 读取。40px 标签栏、图标切换关闭按钮的交互、空启动器和响应式 Sheet 行为改编自 [T3 Code](https://github.com/pingdotgg/t3code) 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`；[`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md) 保留完整 MIT 文本。

`/client` 入口导出插件主体、`IWorkbench`，以及品牌化界面和展示类型。组件、store factory、目录投影和 controller 实现保持包内私有。

## Model Experience

无；Workbench 管理浏览器查看状态，不会有任何内容进入模型请求。

#### KV Cache effect

无；该包既不组装也不发送模型请求。

## Known Limitations and Deferred Work

- **标签页是临时的，并按打开顺序固定** — 重新加载会丢弃全部标签页，切换 Session 会隐藏面板，且标签页无法重排。
- **Shell 不提供终端、浏览器或 Git 数据** — 这些能力需要独立注册的界面及其自身 Host 约定；Files 拥有自己的文件系统 Remote，而 Changes 仍是已载入 Session 的变更历史，并非仓库 diff。
