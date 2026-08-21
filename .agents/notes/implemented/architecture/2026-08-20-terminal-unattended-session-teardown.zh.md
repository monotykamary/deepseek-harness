# Agent Note: Terminal unattended session teardown

Status: implemented

[English](2026-08-20-terminal-unattended-session-teardown.md) | 中文

## Problem

浏览器终端会话按设计是持久的：查看方 detach 只移除对应 stream tap，PTY 因此能跨面板开关、浏览器关闭与查看方交接存活。但没有任何东西约束这种持久性。没有查看方的 PTY 若其前台进程持续产出（失控的 `watch`、`yes` 或 TUI 刷新循环），会在主机上无限消耗 CPU；有界 scrollback 限制了内存，却没有限制进程资源；握手在首次 attach 前死掉的 spawn 会泄漏一个后续任何路径都不会再关闭的 shell。

## Decision

交互模式会话（以 `interactive: true` spawn；只接受 attachment，因为 `startSend` 会拒绝它们）在 spawn 时即启动无人值守退出 deadline。查看方 attach 会清除它；最后一个查看方 detach 会重新启动它；触发时先复查没有查看方、会话仍在运行且未在关闭，再调用 `close('unattended')` 复用既有的静默 teardown。受控（模型）会话从不启动该 deadline。窗口由 `unattendedExitMs` 配置字段决定，默认 30 分钟，`0` 禁用该策略；校验只接受非负安全整数。

## Alternatives considered

**最后一个 detach 即 kill。** 立即回收，但摧毁共享持久化特性：切换查看方而关闭面板会终结 shell，settled 会话工作流也期望终端比单个视图活得更久。

**基于空闲退出（N 时长无输出）。** 保留已 detach 的长时间构建，但本次修复的动因正是持续产出、没有查看方的进程——空闲检测对它永不触发，失控的 CPU 消耗依然存在。

**无查看方且已饱和时暂停 PTY 读取。** 背压能冻结失控进程，也会冻结用户有意留在后台运行的合法 detach 命令，且改变了进程管理提供方所有的读取语义。teardown 完全不动提供方语义。

**服务级清扫器。** 一个全局定时器扫描所有会话，每个 tick 复查每个会话，替代每会话一个 deadline，同时丧失按会话控制。每会话 deadline 的代价只与会话数量成比例。

## Consequences

即使前台进程持续产出，孤立的浏览器 PTY 也会在无人值守窗口后被回收。运行时间超过窗口的 detach 命令会随会话一起被杀——这是已记录的取舍，可按部署配置或禁用。模型会话与既有的 send／就绪路径不受影响。

## Verification

`session.spec.ts` 用假定时器固定 spawn 启动、attach 清除、detach 重启、自然退出不重复关闭、`0` 禁用与受控模式豁免；`config.spec.ts` 固定零值、负数与小数校验用例。

## Related

[Terminal latency parity](2026-08-19-terminal-latency-parity.zh.md) 拥有输出调度与查看方 fan-out 机制，本次 teardown 为它们加上时间上的边界。
