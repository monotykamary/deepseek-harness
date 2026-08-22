# @monotykamary/dsh-client-ui-deliverables

[English](README.md) | 中文

已更改文件、可点击文件引用、已载入 Changes 与模型可读修改 ledger 功能的属主。Node 侧注册最终回复指引与 `changes_read`；浏览器侧把已完成轮次末尾的产出文件行注册到 chat 视图的 `conversation.chat.turnTail` slot，将收尾正文中匹配的行内代码引用转换为链接，并向 [`ui-workbench`](../ui-workbench/README.zh.md) 贡献 Changes 及其图标与启动器说明。正式提供的组合中只有 Web patch 加载本包；从 cordis.yml 中删去这一项会一并移除提示词、ledger 工具、文件行、正文链接、变更投影与 Workbench 标签页。

`deliverablesDefinition` 把每个轮次中已提交的 `FileMutation` receipt 折叠进引擎发布的 `DeliverablesTurnData`；`producedForClosing` 结合收尾 Assistant 的 seq 读取这份数据。直接 `tool/result` receipt 与嵌套 `tool/code-dispatch` receipt 使用同一带版本投影，并按提交顺序而非并行调用的结果顺序折叠，嵌套事件则由根执行 location 提供轮次归属。呈现元数据可以提供标题，但不能创建修改条目。没有有效 receipt 的调用不贡献任何条目；删除仍会出现在 Changes 中，但不会生成可打开文件条目；产出路径在每个轮次内按首见顺序只出现一次。Conversation Location 索引会在轮次修改文件后不含正文便结束时保持正确归属。

`ProducedFiles` 在收尾消息正文与其 IconActions 之间渲染一张 T3 风格的已更改文件卡片。低对比度标题栏报告不同文件数与 receipt 的新增／删除行总数，可统一收起或展开推导出的文件夹，并打开该 Session 的完整 Changes Workbench。始终可见的树按目录汇总工具提供的路径，在目录行显示汇总统计，在文件行显示逐文件统计；每个文件行都会打开 Changes Workbench，因此删除项仍可审阅，但不会成为行内提及目标。Workbench 按不同路径汇总已载入的修改 hunk，把每个文件呈现为默认展开的手风琴行，显示行数统计，并提供独立及全部收起控制。属主本地化的 `DiffBlock` 采用无缝文件外观：手风琴标题栏拥有路径与统计，紧接其下的正文不再重复卡片标题、圆角几何或页脚。它报告不同文件数与汇总行数，随历史页载入增量更新；既不读取仓库，也不声称是 Git 工作树状态。设计原理：[workspace 文件链接 Agent Note](../../../.agents/notes/implemented/feature/2026-07-31-web-workspace-file-links.zh.md)与 [Workbench 决策](../../../.agents/notes/implemented/feature/2026-08-18-web-ui-workbench.zh.md)。

收尾正文承载同一份词表。本插件提供供 chat 视图按收尾消息查询的 `chatFileMentions` 服务：`producedFileMentions` 按精确路径解析行内代码 token，或当 token 恰好等于某条产出路径的 basename，且这样的路径仅有一条时解析——两条路径共享同一 basename 时，文本保持不可点击而不作猜测，因此提及链接永远不会打开错误的文件，也不会导致 404。解析成功的提及保留代码标签，并采用 Markdown 样式表的链接样式：静止时为链接蓝色，悬停时显示下划线，与 URL 提升的行内代码完全一致——完整路径作为其 `title`；提及绝不会渲染在链接内部或流式文本中。决策记录：[行内文件提及 Agent Note](../../../.agents/notes/implemented/feature/2026-08-07-web-inline-file-mentions.zh.md)。

Node 侧注册静态系统提示词段落 `ui:deliverable-file-references`。它要求模型点名成功创建或修改的主要文件，并将这些文件以及正文中提到的其他本轮变更文件写成 Markdown 行内代码：使用文件工具采用的精确路径，或仅在 basename 能唯一指代本轮文件时使用 basename。该提示词只向模型说明渲染器接受的语法；它不约束无关的路径讨论，也不会扩大渲染器的成功修改词表。

同一个 Node 插件还会为调用 agent 的完整 live Session 注册 `changes_read`。列表调用返回可选 cursor 之后按提交顺序排列的修改摘要；指定 `commit_order` 的调用则分页返回已记录的 replacement hunk。必需配置 `maxListItems` 与 `maxDiffChars` 会约束结果。该工具永远不读取工作区，并会标明其仅覆盖 receipt，因此模型会用普通当前文件读取对比已记录意图，再向前写入对账结果，而不会把输出当作 patch 或仓库 snapshot。

## 配置

`maxListItems` 与 `maxDiffChars` 是必需的正整数。前者限制一页摘要数量；后者以 UTF-16 code unit 限制一页详情中的修改文本；固定的覆盖范围与继续读取提示不计入该 payload 预算。二者都不会改变持久 ledger 或浏览器 Changes 投影。

## 模型体验

### 可点击文件引用指引

#### 模型看到的内容

一段固定提示词要求模型在最终回复中点名成功创建或修改的主要文件，并将这些文件以及正文中提到的其他本轮变更文件写成采用精确路径或唯一 basename 的 Markdown 行内代码，例如 `out/report.html`。

#### Token 影响

加载本包时增加一段固定提示词与固定 `changes_read` schema。只有模型调用该工具时才增加 ledger 结果 token，且结果受配置约束。

#### KV Cache 影响

该段落与工具 schema 在本包加载期间保持静态，因此留在可复用的请求前缀中，不会随 Turn 改变。

### 修改 ledger 读取器

#### 模型看到的内容

生成的 [`changes_read` schema](../../../docs/tool-catalog.zh.md#monotykamarydsh-client-ui-deliverables) 会列出当前完整 Session 中由直接或嵌套 receipt-aware 工具产生的文件修改，或返回某个选中修改的路径、hash 与已记录 replacement hunk。每个结果都会说明其中没有 shell 与外部修改。

#### Token 影响

Web 请求中会包含固定工具 schema。列表页受 `maxListItems` 限制；详情页受 `maxDiffChars` 限制，并从返回的 offset 继续。

#### KV Cache 影响

Schema 的前缀保持稳定。每次调用结果都像普通工具结果一样追加在可复用前缀之后。

## 已知限制与暂缓事项

- **Changes 覆盖已载入的 Session 窗口，而非仓库。**当前 client 窗口外的历史在载入前保持缺席，而 `changes_read` 会独立读取完整 live Session。Terminal 创建的文件没有结构化 diff；外部编辑或未提交 Git 状态不属于这两个 target。
- **提及匹配只认精确路径或唯一 basename。**后缀式提及（`out/index.html` 写作 `index.html` 可解析；`deep/out/index.html` 写作 `out/index.html` 则不行）保持不可点击；等真实的收尾消息形态产生需求后再放宽匹配规则。
- **终端命令间接创建的文件仍不在匹配词表内。**除非已接入工具为该路径记录成功的 `FileMutation` receipt，否则在行内代码中点名这类文件不会使其可点击。
