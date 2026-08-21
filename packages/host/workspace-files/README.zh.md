# @monotykamary/dsh-host-workspace-files

[English](README.md) | 中文

Session 授权且与 provider 无关的 Host Remote，用于工作区目录列表、有上限的文本读取及带版本防护的替换。`WorkspaceFilesGateway` 注册 `workspaceFiles` 命名空间及三个生成的 direct method：`workspaceFiles/list`、`workspaceFiles/read` 与 `workspaceFiles/write`。浏览器提供 Session id 和 `WorkspaceFileLocator`；Typert 在调用方法前解析该 Session 的 Agent，因此 gateway 从不接受浏览器提供的绝对路径或文件系统 provider。

每次调用都通过该 Agent 当前的 `ctx.fs` 解析所选 Session 的 `cwd`。locator 是从该根目录开始的精确子项名称数组。遍历会列出每一级父目录，并且只跟随匹配的 provider 自有 `FsDirEntry.target`；`fs.contains(root, target)` 会在继续遍历、读取或写入前拒绝越界子项。越出根目录的条目仍会显示为禁用的 `other` 行，但不会暴露其 target 元数据。文件系统服务缺失、Session cwd 缺失、locator 格式错误或过深、条目缺失、取消以及意外 provider 失败都会拒绝 Remote 调用。

`list` 按 provider 顺序返回直属子项，对数组施加上限，并报告 `truncated`。只有完整流式内容的精确 UTF-8 字节数不超过包含式上限时，`read` 才返回完整文本和不透明 `WorkspaceFileVersion`。常规文件的 size 元数据可在流式读取前拒绝过大文件；缺少 size 时以流式结果为准。可预期的不支持状态返回 `unavailable`，原因为 `too-large`、`not-text` 或 `not-file`；该服务从不返回部分内容。`write` 只接受不超过自身字节上限的完整文本替换，并把浏览器最近持有的版本作为 `replaceIfVersion` 传给 `fs.writeText`。provider 发生并发更改时返回 `conflict`；成功结果返回 provider 规范化后的内容及下一版本。

## 配置

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `maxDirectoryEntries` | `2000` | 单次 `list` 调用返回的直属子项上限。 |
| `maxPreviewBytes` | `1048576`（1 MiB） | 单个完整 `read` 结果的包含式 UTF-8 字节上限。 |
| `maxWriteBytes` | `1048576`（1 MiB） | 单个完整 `write` 替换的包含式 UTF-8 字节上限。 |
| `maxDepth` | `64` | 从 Session 根目录开始遍历的 locator segment 上限。 |

四个值都必须是正安全整数；无效的自包含配置会在插件构造时明确失败。

包根入口导出 `WorkspaceFilesGateway`、`Config` 以及 JSON 安全的 locator、entry、listing、read、version 与 write-result 类型。`./types` 只导出该 payload 词汇；Typert 生成的 Host 与 Client 产物位于 `./typert` 和 `./remote`。浏览器包通过显式的 [`api-remotes`](../../api/remotes/README.zh.md) 组合消费后者。[Files Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-workspace-files-workbench.zh.md)负责授权与有界读取的理由。

## Model Experience

无；这个仅限 Host 的文件投影不注册提示词、工具、消息或提供方请求。

#### KV Cache effect

无；本包从不组装模型输入。

## Known Limitations and Deferred Work

- **无递归查询或分页** —— 每次调用只列出一个目录，并只返回 provider 排序后的前若干个子项；截断目录没有续传 cursor。
- **无范围读取或二进制预览** —— 过大、非 UTF-8、二进制及非常规 target 返回不可用原因，而不是字节或部分前缀。
- **无创建、删除或重命名** —— `write` 只替换经 `read` 观测过的常规文本文件；provider 版本会拒绝过期浏览器内容。
- **无独立文件系统生命周期** —— 调用需要一个可解析的 Session Agent、已选择的文件系统 provider 和工作区 cwd；该 Remote 不是通用 Host 文件浏览器。
