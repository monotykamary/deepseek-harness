# Agent Note: 外部编排的集成机制

Status: implemented

[English](2026-08-22-external-orchestration-integration-seams.md) | 中文

## 问题

外部 bundle 可以组合 Agent、Session、工具和浏览器插件，但仓库自动化没有与提供方无关的 checkout 生命周期，Web Client 也没有用于第二个根应用的增量路由。因此，任务编排器只能直接调用 Git 并替换 Conversation 或 Sidebar 的持有方，或者把产品专属的任务数据库与调度器移入 harness 仓库。

Checkout 清理还需要原始 Git 命令无法独自持有的事实。受管链接 checkout 不能与用户的主 checkout 或无关 checkout 混淆；活跃 Session 的 cwd 所有权必须阻止删除，而不能依赖编排器进程内的账本。

## 决定

DeepSeek Harness 持有两项与产品无关的集成机制，持久任务／流程／运行状态则留在外部 bundle。

`@monotykamary/dsh-worktree` 提供 `ctx.worktrees`：一个显式配置提供方的注册表，用于定位仓库、列出 checkout 信息、创建受管链接 checkout、删除 checkout，以及有界清扫陈旧集合。`@monotykamary/dsh-worktree-git-local` 是随产品交付的本地提供方。它把受管 checkout 保存在已配置根目录下，生成有界且抗冲突的分支名，只复制配置中列出的忽略文件，并拒绝删除主 checkout、非受管 checkout、脏 checkout 或被活跃 Session 持有的 checkout。提供方注册是 effect，会与其插件 fiber 精确同步卸载。该 API 不持有队列、依赖图、发布、合并或分支策略。

`@monotykamary/dsh-client-ui-layout` 在根 store 中持有一个选中的 `ApplicationSurfaceId`。`application.surface` 是由 selector 路由的 chain，现有 Conversation 持有方是其 fallback。`@monotykamary/dsh-client-ui-sidebar` 声明增量 `sidebar.navigation` list，并传递选中的 id 与 layout 持有的打开 action。外部浏览器插件可以贡献一行导航和一个匹配的应用 entry，而无需替换 frame、Sidebar、Conversation、details、bottom panel 或 overlay。

`@monotykamary/dsh-client-ui-conversation` 持有 `ctx.conversation.submissions`：一个环绕普通 composer 接纳的有序、effect 所有 middleware 注册表。InputHub 会在分派前解析结构化引用与仍存活的浏览器图片文件，并把未改变的 Host 发送保留为末端 `next()`。middleware 失败继续走输入状态机保留草稿／图片的路径；成功的 Consumer 只能在 Host 接纳后导航。外部产品可将该操作与 `conversation.input.left` 配对，用紧凑意图控件扩展 New Session，而无需替换 New Session 或维护第二套 composer。

Factory Consumer 在空白 Session 上暂存 Session、Task、新流程或现有流程放置方式。Session 会原样调用 `next()`。Task 与 Flow 在 Factory 提交一个链接到该空白 Session 的幂等草稿后消费本次提交；它们不启动任务 Agent run，也不通过空白 Session 发送提示词；它们经输入状态机返回成功以清除共享草稿图片，并打开准确的任务卡。Factory 仍是投影／控制应用；其持久图留在外部，共享 Session 工作流持有人工入口。

配套的 `dsh-factory` bundle 消费这些机制以及既有的 Agent、Session、ToolRuntime、Skill、Shell、Attachment、Typert Remote 与 preset 服务。它的 SQLite 图和调度器留在本仓库之外，因为它们是一套产品策略，而不是 harness 原语。Factory 分配和完成工具调用使用普通 Session 日志；外部调度器不会增加第二个 Agent loop。应用精确固定的 Web 模板会在 Fabric 与 Fovea 之后组合 Factory，因此默认 Web profile 含有完整控制应用。Headless 保持一次性运行并省略 Factory，因为其后台调度器需要长生命周期 host。

## 验证

Worktree 包测试覆盖提供方选择、生命周期释放、真实 Git 的创建／列出／删除／清扫行为、脏状态拒绝、主 checkout／非受管 checkout 拒绝、活跃 Session 保护、忽略文件复制与 Loader 组合。Layout 与 Sidebar 的组件／store 测试覆盖应用选择、chain fallback／接管、展开与 rail 导航、New Session 返回 Conversation，以及 HMR 释放。Conversation 注册表与 InputHub 编排测试覆盖顺序、继续、消费、重复调用 `next()` 的拒绝、释放，以及真实 Session 提示词 sink。外部 bundle 另有真实 SQLite 图／lease 测试、空白／活跃 Session 入口测试、客户端消费／重定向测试，以及一个从排队任务经过已记录 `factory_finish` 到完成结算的组装式脚本 AgentLoop 运行。

## 备选方案

**把完整任务工厂放入 harness monorepo。** 否决：任务字段、图策略、重试、finalizer、issue 呈现和发布流程都是产品决策。将其保留在外部，能够验证其他产品也可使用的同一套 package 与 bundle 接口。

**让每个编排器直接调用 Git。** 否决：提供方选择、受管根目录所有权、活跃 Session 保护和安全清理会被重复实现，也无法迁移到远程 checkout 提供方。

**替换 Sidebar 或 Conversation 根。** 否决：第二个应用会接管无关的 Session 导航与呈现。增量导航 list 加 selector chain 会保留这些持有方，并让 HMR 只移除外部应用。

**把任务与流程创建留在 Factory 应用内。** 否决：产品自有 modal 会重复 New Session 已经持有的 Workspace、模型、权限、附件、草稿与提示词接纳行为。紧凑意图贡献加 submission middleware 会保留普通 Session 路径，让 Factory 专注于观察与控制。

**只把 Factory 任务表示成 Session。** 否决：依赖、重试、通道分配、finalizer 与涌现观察项拥有不同于单条对话日志的生命周期。模型可见的执行仍属于 Session；编排状态不属于。

## 结果

外部产品可以添加根应用和仓库自动化，而无需修改 Agent loop 或替换随产品交付的 UI 持有方。定制 Web 风味通过精确固定的 Factory companion 默认采用这条扩展路径，而 Headless 保留有界的单任务生命周期。Worktree 安全性由一份提供方实现统一持有，并可在以后增加非 Git 或远程提供方。Conversation 仍是默认应用，并按照 frame 的 chain 渲染行为在被选中时保留自身状态。

主 bundle 增加一个小型提供方注册表、一个本地 Git 提供方、一个所选应用 id、两个根应用 UI slot，以及一个普通发送 middleware 注册表。middleware 可以延迟或消费接纳，因此每个 Consumer 都要持有可见失败行为；保留发送时恰好调用一次 `next()`，并通过 Host 记录任何模型可见输入。Consumer 仍须设计持久协调、队列公平性、重试策略、发布与清理时机。本地提供方在安全性不确定时会有意保留工作，因此保留下来的受管 checkout 需要后续显式删除或有界清扫。
