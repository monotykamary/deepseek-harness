# Agent Note: 受信任的用户系统指令

Status: implemented

[English](2026-08-26-trusted-user-system-instructions.md) | 中文

## 问题

工作区 `AGENTS.md` 与 `CLAUDE.md` 文件是由仓库控制的输入。DeepSeek Harness 有意把它们记录为较低权限的用户消息，因此克隆仓库无法把其文本提升到直接用户、developer 或 system 指令之上。用户全局 `$DSH_HOME/AGENTS.md` 采用同一持久消息路径，因而缺少一个简单、由用户拥有且真正进入系统提示词的常驻策略位置。

## 决策

`@monotykamary/dsh-agent-instructions` 在插件加载时读取一次 `$DSH_HOME/APPEND_SYSTEM.md`，把经 trim 的 UTF-8 内容注册为顺序 1 的 `user:system-instructions` 系统提示词 section，位置紧随部署 persona、早于工具指引。`dshHome` 决定受信任目录；`trustedSystemFile` 只能更改同目录文件名，`trustedSystemMaxBytes` 约束完整来源，默认 65,536 字节。

该文件是可选的。文件缺失或只有空白时贡献空 section。内容超限、UTF-8 格式错误、无效的同目录配置与 I/O 失败都会拒绝插件加载，而不会安装部分策略。内容发生变化后需要重新加载插件或进程；每次组装的请求头会记录有效系统提示词，从而保持请求可重建。

仓库与用户全局 `AGENTS.md` 文件仍然是持久的 user-role 指引，并保留现有发现、优先级、刷新与压缩行为。受信任文件不属于该 baseline，绝不会在仓库中被发现，也不进行触摸驱动的刷新。

## 考虑过的替代方案

**把所有 `AGENTS.md` 文件提升到系统提示词。** 否决，因为仓库控制的文本会获得 system 权限，并可能覆盖用户请求或部署安全策略。

**只提升 `$DSH_HOME/AGENTS.md`。** 否决，因为一个文件名会同时承载两种权限模型，现有用户可能在不知情的情况下提升按低权限约定编写的文本。独立名称让信任决定保持显式。

**把受信任策略存为内联 Cordis 配置。** 否决其作为唯一接口，因为多行策略难以编辑，也难以跨 profile 共享。文件的目录、名称与字节上限仍可通过配置 patch。

**每次请求都刷新受信任文件。** 否决，因为常驻系统文本在进程生命周期中应保持前缀稳定，重复的同步宿主读取还会让提示词组装依赖文件时序。重新加载是显式应用点。

## 后果

- 用户可以把必须具有 system 权限的路由或委派策略放入 `$DSH_HOME/APPEND_SYSTEM.md`。
- 克隆仓库指令保留其较低权限安全姿态。
- 受信任文件变化只会在重新加载后使系统提示词前缀失效；缺失时不消耗模型 token。
- 单元测试固定权限位置、与 `AGENTS.md` 的分离、字节与 UTF-8 失败、缺失以及 effect dispose。
