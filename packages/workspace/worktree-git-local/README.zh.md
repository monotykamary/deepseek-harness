# @monotykamary/dsh-worktree-git-local

[English](README.md) | 中文

`ctx.worktrees` 的本地 Git provider `git-local`。

## 行为

- 仓库标识是主 worktree 规范路径的 SHA-256 前缀；链接 worktree 通过 `git rev-parse --git-common-dir` 得到相同标识。
- 列表解析 `git worktree list --porcelain`，标记主、当前、锁定及可清理 checkout，识别配置的托管根目录下路径，并列出 cwd 位于 checkout 内的所有活跃 DSH Session。
- 创建使用抗冲突托管目录和 `dsh/<label>-<id>` 分支。`fresh` 优先使用 `origin/HEAD`，按配置执行一次有界、非交互 fetch，并回退到本地 HEAD。`head` 使用本地 HEAD；显式 ref 必须可解析。
- `.worktreeinclude` 是被忽略且未跟踪常规文件的 allowlist。绝对、父级穿越、否定、符号链接、超大和超量条目会跳过。复制失败不会回滚已存在的 Git worktree。
- 删除仅接受干净、未占用、未锁定、非当前的托管链接 worktree，并调用不带 `--force` 的 `git worktree remove` 进行第二次干净性检查。
- 清理还要求调用方提供年龄和数量上限。分支 ref 会保留。

所有 Git 命令都通过 `ctx.subprocess` 执行，禁用终端提示和 pager，限制输出，继承调用方取消，并在配置的截止时间终止。

## 配置

`root` 必填且必须为绝对路径。命令截止时间、输出限制、终止宽限、fresh base fetch、分支标签长度、include 文件名、include 文件大小、pattern 数、复制文件数和复制字节数均可通过 Cordis 配置。

## 模型体验

无；本 provider 不注册工具或请求上下文。

#### KV Cache 影响

无；worktree 操作位于 Host 侧。

## 已知限制与延期工作

- **仅支持 Git**——没有 Git worktree 模型的仓库需要其他 provider。
- **仅当前进程占用信息**——活跃 Session guard 使用 `ctx.agents`；跨进程 consumer 在调用删除前必须增加共享 presence guard。
- **setup hook 由 consumer 拥有**——创建会报告已复制文件，但不执行仓库命令；自动调度器通过 shell capability 运行其显式配置的 setup。
