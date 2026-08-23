# @monotykamary/dsh-tool-session-mutations

[English](README.md) | 中文

这是对当前 Agent 持久文件修改 receipt 的有界模型读取器。本包注册 `changes_read`；纯 `./ledger` 入口导出同一套按提交顺序排列的投影，供外部自动化使用，且不会执行插件。

列表调用会返回可选 `after_commit_order` cursor 之后的摘要。指定 `commit_order` 的调用会按 UTF-16 页返回已记录的 replacement hunk。每个结果都会说明 ledger 只覆盖 receipt-aware 工具。它永远不读写工作区，输出是已记录意图，而不是 unified-patch 语法或仓库状态。

## 配置

| 键 | 含义 |
|---|---|
| `maxListItems` | 必需的正整数，用于限制一页摘要数量。 |
| `maxDiffChars` | 必需的正整数，用于限制一页详情中的修改文本。 |

## 模型体验

### 修改 ledger 读取器

#### 模型看到的内容

生成的 [`changes_read` schema](../../../docs/tool-catalog.zh.md#monotykamarydsh-tool-session-mutations) 会列出当前完整 Session 中由直接或嵌套 receipt-aware 工具产生的修改，或返回一项修改的路径、hash 与已记录 replacement hunk。结果会明确排除 shell 与外部修改。

#### Token 影响

插件挂载期间会提供一个固定 schema。列表页受 `maxListItems` 限制；详情页受 `maxDiffChars` 限制，并从返回的 offset 继续。

#### KV Cache 影响

只要定义不变，schema 就保持前缀稳定。每次调用结果都像普通工具结果一样追加在可复用前缀之后。

## 已知限制与暂缓事项

- **Ledger 记录接入的工具，而非仓库状态。**Terminal 命令、外部编辑、文件 mode 与未提交 Git 状态均缺席。
- **Hunk 是面向展示的 replacement intent。**调用方在对账前必须读取当前文件，不能把输出当作 patch 应用。
- **只能读取 live Agent Session。**持久 Session 必须先恢复，工具才能检查其完整事件历史。
