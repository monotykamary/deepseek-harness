# Agent Note: custom-flavor 组件包在 harness 工作区中默认从 npm 解析

Status: implemented

[English](2026-08-20-npm-default-custom-flavor-dev-install.md) | 中文

## Problem

全新的 harness 检出无法组合 `web` 或 `headless` profile：工作区的 `overrides` 把 `dsh-fabric` 和 `dsh-fovea` 钉在旁人没有的同级 `link:` 检出上，而 pnpm 11 会静默跳过缺失的 `link:` override 目标 —— 安装以 0 退出，两个组件包都不落进 `node_modules`，第一次失败发生在 profile 启动时，以一条与根因毫不相干的裸模块解析错误出现。已用 node:24 容器中的干净克隆验证：安装退出码 0，每个 `node_modules` 里都没有 `dsh-fabric`，从 `apps/cli` 执行 `require.resolve('dsh-fabric')` 抛错。一位下游使用者在真实环境中踩中了这一点，并自行猜测布局，把他的 dsh-fabric 检出嵌套到了 `apps/web/dsh-fabric`。钉链接的做法早于组件包的发布；它们如今在 npm 上（`dsh-fabric@0.1.0`、`dsh-fovea@0.2.0`），因此公共默认值成为可能。被本说明部分取代的同级链接设计由[定制风味默认组件包及其发布](2026-08-20-custom-flavor-default-bundles-and-publication.md)持有。

## Decision

工作区不再声明任何 custom-flavor overrides：`dsh-fabric` 和 `dsh-fovea` 经由 `apps/cli` 的已发布版本范围（`^0.1.0`、`^0.2.0`）从 npm 解析，与安装的 `@monotykamary/dsh` 完全一致。monorepo 中没有任何代码静态导入这两个包 —— 它们都是启动期的 patch 层 —— 因此源码门禁一直以来隐式运行的就是这种配置。同时开发同级仓库是自选项：把 `dsh-fabric` 和 `dsh-fovea` 克隆在本仓库旁边后，开发者按 `pnpm-workspace.yaml` 注释中给出的两行重新加回 `link:` overrides 且不提交；每个同级工作区都带有指回本检出的对称 `@monotykamary/*` overrides。

## Alternatives considered

**保留同级 overrides 并加一个在安装前响亮失败的 preinstall 守卫。** 这把每位新开发者都绑定在强制双仓库布局上，而这个失败模式只有风味包的共同开发者才会遇到；发布使 npm 解析可行之后，守卫保护的只是一种大多数贡献者从不使用的工作流。

**假定 pnpm 会对缺失的 link 目标报错**（先前说明的前提）。已被实证推翻：pnpm 11.7 既不记日志也不建立链接，因此该要求一直到启动前都不可见。

## Consequences

README 的 `git clone … && pnpm install && pnpm dsh web` 流程用单次克隆即可组合。风味包的共同开发者失去了始终在线的活链接：拉取本变更后，持有同级检出的维护者要手动重新加回 overrides；不加 overrides 启动时跑的是 npm 发布的组件包 —— 包括 `dsh-fabric@0.1.0` 相对 rc.7 阵容的两条过期 patch 条目警告 —— 而非本地检出。同级说明中的发布顺序部分依然成立。
