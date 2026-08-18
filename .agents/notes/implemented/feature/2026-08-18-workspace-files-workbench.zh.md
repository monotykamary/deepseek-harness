# Agent Note: Session-authorized Files workbench

Status: implemented

[English](2026-08-18-workspace-files-workbench.md) | 中文

## Problem

Workbench 能够承载功能自有标签页，但 Web 应用没有文件 explorer。浏览器无法从绝对路径安全推导 Session 工作区，而 directory-picker Remote 面向工作区选择列出 Host 目录，并非通过 Agent 选择的文件系统 provider 读取。复用它会绕过 provider 选择与文件系统 containment policy。预先加载完整文件树还会让一次面板请求随整个工作区规模增长。

## Decision

`@monotykamary/dsh-host-workspace-files` 发布 direct `workspaceFiles/list`、`workspaceFiles/read` 与 `workspaceFiles/write` Remote。Typert 将浏览器的 Session id 解析为 Session Agent；gateway 只以该 Agent 当前的 `ctx.fs` 与 `session.header.cwd` 作为文件系统权威。浏览器请求携带相对于该根目录的 provider-neutral 子项名称数组，从不携带绝对路径或序列化 provider target。

遍历会列出每一级父目录，并且只跟随匹配的 provider 自有子 target。每个跟随的 target 都必须满足 `fs.contains(sessionRoot, target)`。越界子项会投影成仅含名称的 `other` 条目，无法继续遍历或预览。Host 通过经过验证的 `maxDirectoryEntries`、`maxDepth`、`maxPreviewBytes` 与 `maxWriteBytes` 配置限制直属子项、locator 深度、完整 UTF-8 读取字节数和完整 UTF-8 替换字节数。超过读取上限、包含非文本数据或指向非文件时会返回稳定的不可用原因；Remote 不会传递部分内容。成功的文本读取携带不透明 provider 版本。`write` 会解析并约束同一 target，要求其为常规文件，并把该版本作为 `replaceIfVersion` 传给 provider 的原子 `writeText`；过期内容返回 `conflict`，而不会覆盖 Agent 或外部程序的并发更改。

`@monotykamary/dsh-client-ui-files` 注册稳定的 `files` Workbench 界面、对应图标与启动器说明。Conversation 的通用 Session 标题栏控件读取 AppFrame 的实时 Details 状态，并通过同一个镜像面板图标切换空 Workbench。每个驻留 Session 拥有一个临时 Files store。根目录与子目录按需加载；目录与文件结果会缓存到显式刷新发生时，请求代次与取消机制则防止过期响应替换当前状态。搜索只覆盖已加载节点，并为每个结果标注父路径。选择支持的文件时，共享的带行号 `SourceEditor` 渲染完整值。改编自 T3 的单次在途 coordinator 等待 500 ms，只保存最新完整值，把返回版本用于下一次写入，并在编辑器卸载时刷新最新待处理值。同一个 Files 组件与编辑器会在紧凑右侧 Sheet 中渲染。

文件树、筛选工具栏、面包屑编辑器、图标与保存 coordinator 改编自 T3 Code 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2` 的 `FileTree.tsx`、`FileTreeItem.tsx`、`FilePreviewPanel.tsx`、`PanelHeader.tsx` 与 `fileSaveCoordinator.ts`。实现保留 T3 的紧凑信息层级，但以 Cordis 注册、Session 范围状态和 DSH 现有文件系统 provider 替代其桌面 RPC、route 状态与 Zustand store。

## Verification

Host 测试固定 direct Remote 注册、provider 顺序投影、越界 target 隐藏、遍历深度、可配置读写上限、完整 UTF-8 读取、带防护的 provider 写入 intent、保存版本、冲突、不可用原因、取消与缺失权威时的明确失败。Client 测试固定每 Session 缓存与取消行为、已加载节点筛选、文件树键盘导航、SourceEditor 行为、单次在途自动保存、全部保存结果及展示／标题栏注册。无密钥 Web journey 启动发货组合；通过同一个标题栏切换控件打开、收起并重新打开空面板；经 Remote 列出并展开真实临时工作区；编辑带语法高亮的源码；在磁盘上观测保存值；筛选已加载行；验证标签页图标／关闭按钮切换；并保留内联与紧凑承载。

## Alternatives considered

**复用 directory picker。** 它的权威是 Host 路径选择，只列出目录，也不通过 Session Agent 选择的文件系统 provider 执行。扩展它会把工作区采用与文件读取耦合，并绕过 agent 工具使用的 policy point。

**向通用 Host 文件端点发送绝对路径。** 这会向浏览器暴露 Host 路径身份，无法支持非本地 provider，还会让调用方选择 Session 派生权威以外的文件系统 target。

**递归获取完整文件树。** 一次打开操作可能遍历无上限的工作区、保留未使用节点并延迟首批可用行。延迟的直属子项调用限制每次请求，并让已加载节点的搜索范围保持明确。

**在 `ui-workbench` 内实现 Files。** Shell 会获得文件系统数据、Remote 依赖与功能状态。注册式功能包让标签承载与文件权威保持独立，并使插件清理能够移除完整贡献。

**不使用版本防护直接覆盖。** 只发送最新编辑器值更简单，但面板保持打开期间，Agent 工具或外部编辑器可能更改同一文件。携带 provider 的不透明版本可使原子文件系统写入拒绝过期浏览器内容，而不是静默丢失该更改。

## Consequences

Files 展示并编辑 Session Agent 所选择的同一文件系统世界，而不给浏览器独立路径权威。工作量随用户展开的目录与打开的文件增长，部署上限约束每次读取与替换。代价是一个 Host gateway、一个 Client 功能包、显式的 `api-remotes` 组合、感知版本的完整文件自动保存，以及可能逐级列出路径父目录的遍历。搜索不是服务端全局查询；创建、删除、重命名、二进制或范围编辑、监视、忽略规则、Git 状态与续传分页仍不属于此功能。
