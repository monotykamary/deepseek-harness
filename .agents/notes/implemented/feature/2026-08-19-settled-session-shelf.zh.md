# Agent Note: Settled Session shelf

Status: implemented

[English](2026-08-19-settled-session-shelf.md) | 中文

## Problem

Workspace 浏览器会在分组和扁平侧边栏模式下，把不活跃 Session 移入默认折叠且仍可搜索的历史 shelf。该 shelf 改编自 T3 Code 修订版 `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`，同时保留 dsh 的 Workspace 分组、Session 摘要、后台 job 投影与浏览器本地视图偏好。

## 决策

`@monotykamary/dsh-client-ui-workspace` 通过 `ui-workspace` 设置 namespace 持有不活跃策略。`autoSettleInactive` 启用分类，`autoSettleAfterDays` 接受 1 到 90 的整数。发货 Web bundle 显式配置为启用和三天；Cordis patch 提供组合 base，用户设置文档可以覆盖它。Client 通过 `settingsScope` 绑定解析后的 namespace。Loopback 浏览器采用 Host 解析后的 Cordis／用户值；非 loopback 浏览器无法读取仅 operator 可用的设置平面，因此在进程内采用同一套发货启用／三天策略。

浏览器按分钟量化的时钟把最新已知活动与阈值比较。当前和空白 Session、待处理交互、未查看完成提醒、运行中的 Session、运行中的 subagent 后代，以及 running 或 stopping 后台 job 都留在活跃区。已结 job 会用完成时间延长活动时间。该判断只使用 `SessionListState` 中已有的权威事实，不从组件状态推断存活性。

分组和扁平派生会从活跃行中省略已分类 id。一个全局 shelf 在活跃内容之后，按最新优先顺序渲染同一批可见且未归档的 Session。其 disclosure 状态持久化在 `dsh.workspace.view.v7`；每次展开先显示 10 行，显式操作每次再增加 25 行。shelf 行保留正常操作与 hover 详情，但在 hover 或 focus 前保持弱化。Search 有意忽略 shelf 分区，可以打开任意已结 Session；打开后该 Session 成为当前项，因此回到活跃区。

这是不活跃 settlement，不是 T3 完整的 orchestration settlement 生命周期。dsh 没有持久 PR 状态或显式 settle／unsettle 命令，因此不会伪造这些输入。归档仍是独立的 Host 持久操作，会从 search 与所有浏览投影中移除 Session。

## Consequences

Settlement 只改变侧边栏呈现与设置状态；它不追加 Session event，也不增加模型可见输入。Search 与打开操作仍是恢复路径，archive 则保留更强的全局隐藏语义。非 loopback 浏览器无法消费 Host／用户 override，因为设置平面仅 operator 可用，但它们仍采用发货的启用／三天行为。

## Verification

纯测试固定严格的不活跃边界、禁用模式、selected／live／pending／unread／subagent／job blocker、活跃投影排除与 search 包含。浏览器测试覆盖持久 disclosure、跨分钟边界移动、10／25 分页、行呈现，以及原有分组／扁平排序。无密钥 navigation journey 会用真正陈旧的种子 Session 启动发货 profile，对折叠和展开 shelf 状态做 snapshot，并继续在 shelf 折叠时通过内容 search 找到该 Session。

## Alternatives considered

**复用 Session archive 状态。** Archive 有意从 search 和所有侧边栏投影中移除 Session。Settlement 必须保持历史可发现，并能通过 disclosure 恢复显示；共用该状态会改变 archive 语义。

**向每个 Session 日志追加 settlement event。** 不活跃阈值属于用户／部署呈现策略，不是 Session 产生的事实。在没有显式 settle 命令或其他 Consumer 时记录它，会把一个浏览器偏好变成持久且临近模型的状态。
