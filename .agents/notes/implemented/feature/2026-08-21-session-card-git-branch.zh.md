# Agent Note: 会话卡片显示工作目录的 git 分支

Status: implemented

[English](2026-08-21-session-card-git-branch.md) | 中文

## Problem

左侧边栏的 Session 卡片底部把 agent preset（图标加 preset id）作为稳定的执行上下文标签。preset 是 harness 组合层面的事实——大多数用户不会按会话修改它——而它挤掉了用户看卡片时真正用来识别工作目录的事实：git 分支。分支标签才能一眼区分"改动了分支的会话"与"同一仓库里的另一个会话"。

## Decision

卡片底部改为显示 Session 工作目录的 git 分支，不再显示 preset。宿主在响应 `session.list` 时按去重的 cwd 解析分支（按 cwd 的 memo 让多会话仓库只探测一次），直接读取所在仓库的 `HEAD` symref（新增 `git-branch.ts` 模块：目录向上查找、worktree/submodule 的 `gitdir:` 指针文件、linked worktree 各自持有的 HEAD），并通过可选的 `branch` 字段随 `SessionSummary` 与 `host/session-added` 帧上线。客户端运行时经列表 store 与 `SessionNode` 透传，卡片用分支图标在底部渲染。detached HEAD、非仓库 cwd 与未记录 cwd 不显示标签。

agent preset 仍保留在 wire 上：preset 切换 UI（ui-agent-preset）仍读取 `SessionSummary.agentPreset`，宿主在 create/select 时仍写入它。只有卡片标签变了。

批量路径不做探测：分支解析只放在 `sessions.list` 处理器里（search 与列表共用可见性收集器，因此 3 万会话语料的搜索不会为每行付出 stat 代价）。缺失的 cwd 只做一次 `stat`，而不是一路爬到文件系统根目录。

## Alternatives considered

- **保留 preset 并把分支作为第二个标签。** 底部只有一行；同时显示两者读起来像噪音，而工作区标题已在卡片顶行之后，分支才是关键上下文事实。
- **宿主执行 `git branch --show-current`。** 正确，但每次列表刷新都要为每个不同 cwd fork 一个进程；直接读 `HEAD` 以 stat+read 的代价得到同一事实。
- **客户端解析。** 浏览器除了 workspace 路径外没有 cwd 保证，还得为每张卡片运行 git 子进程；宿主本来就在派生摘要行并掌握工作目录事实。

## Consequences

- 仓库内的卡片显示当前分支（下一次列表基线时更新；创建时由 frame 携带）。
- 仓库外、无 cwd 或 detached HEAD 的会话底部没有标签——与之前没有 preset 时的空位相同。
- 设置里的 preset 选择器继续使用自己的摘要透传；没有任何东西依赖卡片上的 preset 标签。

## Testing

新增 `git-branch.spec.ts` 与 `api-proxy-branch.spec.ts` 覆盖仓库/普通目录/worktree/detached cwd 与列表载荷；runtime service spec 覆盖摘要透传与 frame 路径；rows/tree spec 覆盖卡片渲染。
