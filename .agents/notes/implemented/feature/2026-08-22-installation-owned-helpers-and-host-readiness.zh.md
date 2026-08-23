# Agent Note: 安装持有的辅助程序与宿主机就绪状态

Status: implemented

[English](2026-08-22-installation-owned-helpers-and-host-readiness.md) | 中文

## Problem

NPM 闭包携带了 Harness 插件，但部分首次运行能力只有在用户调用时才能发现。Portless 依赖无关的 PATH 安装，shell 与沙箱故障直到首次工具调用才出现，`dsh doctor` 只报告包版本而不判断宿主机能否运行默认 profile。把每项宿主机集成都视为可随安装提供同样不符合事实：Tailscale、语言服务器、MCP 服务器、凭据、浏览器与操作系统设施仍由各自管理。

## Decision

Web 组合包固定支持 Node 22 下限的最新兼容 portless 版本，并从已安装包解析其 CLI，绝不从 PATH 解析。`dsh portless setup` 是安装并启动 portless 特权 HTTPS 服务的明确交互操作；`--portless` 只注册应用别名，并在服务缺失时报告 setup 命令。

`@monotykamary/dsh-distribution-update` 在服务挂载时采样一次无网络宿主机诊断：DSH home 可写性、平台 shell、默认沙箱链与桌面交接。每个未就绪结果都会在 Web 就绪前记录，稳定快照会进入更新页面，`dsh doctor` 也渲染同一词汇。阻塞结果会让 doctor 以 2 退出，但不会停止 Web 服务器，因为设置界面与基于浏览器的修复路径必须保持可达。

更新客户端会在产品欢迎之后、模型凭据之前注册一个 onboarding 步骤。阻塞诊断会让应用保持 inert，直到用户明确选择继续；所有结果与修复指引会一直显示在更新页面。模型凭据保留既有的专用 onboarding 步骤。Bash 命令与终端默认值都通过 PATH 解析 `bash`，因此 shell 诊断检查的正是默认 profile 使用的可执行文件。

Tailscale、配置的 LSP 与 MCP 命令、模型凭据和桌面应用仍是外部集成。面向用户的参考文档会标明这些前置条件，而不会暗示 DSH 包会安装或配置它们。

## Alternatives considered

**由 `--portless` 自动升权。** 拒绝该方案，因为服务 flag 不应意外请求 sudo，或修改系统启动项与信任存储。专用 setup 命令让该特权转换保持明确。

**存在阻塞诊断时让 Web 启动失败。** 拒绝该方案，因为这会移除用户所需的设置界面与修复路径。Doctor 为自动化提供非零结果；Web 则提供明确的人工覆盖。

**随安装提供每项外部集成。** 拒绝该方案，因为系统守护进程、提供方凭据、任意语言与 MCP 服务器，以及桌面应用具有独立的所有者与安全生命周期。DSH 只持有属于其默认行为或具名内置行为的辅助程序。

## Consequences

普通安装会携带 portless 可执行文件，并使用统一的 Bash 名称。首次运行的宿主机故障会在工具执行前可见，同时不妨碍访问配置。DSH 支持 Node 22 期间，portless 必须固定在低于最新版的版本，因为 portless 0.14 及更新版本要求 Node 24；提高 Harness 引擎下限后即可更新该固定版本。诊断探测会在启动时增加有界本地进程工作，并且报告的是能力，而不是对后续宿主机状态不变的保证。
