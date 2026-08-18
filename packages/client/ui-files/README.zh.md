# @monotykamary/dsh-client-ui-files

[English](README.md) | 中文

Web Workbench 的 Session 范围只读工作区树与源码预览。该浏览器插件注册 **Files** `workbench.surface` 条目和 `conversation.session.header.actions` 中的 **打开文件** 操作；两项注册都遵循插件 effect 生命周期。标题栏操作通过 `ctx.workbench` 打开并激活稳定的 `files` 标签页。

每个驻留 Session 拥有一个临时 Files store。打开界面时通过 `remote.workspaceFiles` 延迟列出根目录；展开目录时只列出该目录，选择文件时请求一个完整且有上限的预览。目录结果与预览会缓存到其显式刷新操作发生时。请求代次与 `AbortSignal` 防止过期的根目录、子目录或预览响应覆盖较新的状态。重新加载页面会丢弃该 store。

文件树先展示目录，再展示文件，并在各类型内部保留名称顺序；它支持指针操作和 Up／Down／Right／Left／Home／End 键盘导航，并禁用 provider 标记为 `other` 的条目。搜索只筛选 store 中已加载的根条目和子条目，为每个匹配项显示父路径，并在树下说明该范围。预览将已知源码扩展名映射到共享的语法高亮 `CodeBlock`；`too-large`、`not-text` 与 `not-file` Remote 结果会显示为稳定的不可用状态。意外 Remote 失败会提供重试，而不是显示空树或空预览。

紧凑文件树行、筛选工具栏、面包屑预览和图标处理改编自 T3 Code 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2` 的 `FileTree.tsx`、`FileTreeItem.tsx`、`FilePreview.tsx` 与 `PanelHeader.tsx`。DSH 以 Session 授权的 [`workspace-files`](../../host/workspace-files/README.md) Remote、Cordis slot 和每 Session Workbench store 替代 T3 的桌面 RPC、router 与 Zustand 所有权。[`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md) 保留完整 MIT 文本；[Files Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-workspace-files-workbench.md)负责授权与延迟加载决策。

`/client` 入口导出插件主体。组件、store、展示 helper、slot props 约定、locale 字典与 `files` 界面 id 保持包内私有。

## Model Experience

无；这个仅限浏览器的工作区查看器不注册提示词、工具、消息或提供方请求。

#### KV Cache effect

无；该包既不组装也不发送提供方请求。

## Known Limitations and Deferred Work

- **仅搜索已加载节点** —— 搜索不会发起递归 Host 查询，因此折叠或从未访问的目录只有在用户展开后才能贡献匹配项。
- **只读临时视图** —— Files 不提供编辑、创建、删除、文件监视、Git 状态、忽略规则筛选或持久化的展开状态。
- **仅完整预览** —— Host 因文件过大或非文本而拒绝内容时，面板不会请求字节范围，也不会显示截断前缀。
