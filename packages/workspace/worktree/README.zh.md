# @monotykamary/dsh-worktree

[English](README.md) | 中文

仓库 worktree 的 provider registry 和 provider 中立词汇。`ctx.worktrees` 解析部署显式配置的默认 provider，分派定位、列表、创建、删除和清理操作，并为每个 checkout 与仓库提供品牌化标识。

## Service API

- `registerProvider(provider)` 在调用 fiber 的生命周期内贡献一个实现。
- `resolve(request)` 在执行前补全已配置的 provider。
- `locate` 和 `list` 只读检查仓库。
- 调用方未提供 checkout id 时，`create` 会分配一个。
- `remove` 和 `sweep` 把安全决策交给所选 provider。

服务要求 `config.provider`；不存在适用于所有部署的 provider。在该 provider 注册前调用操作会明确失败。

## 模型体验

无；本包不注册工具、提示或会话事件。

#### KV Cache 影响

无；worktree registry 操作不会进入模型请求。

## 已知限制与延期工作

- **无 provider 能力协商**——consumer 按名称选择 provider 并接收其错误；混合本地和远程仓库需要显式路由 provider。
