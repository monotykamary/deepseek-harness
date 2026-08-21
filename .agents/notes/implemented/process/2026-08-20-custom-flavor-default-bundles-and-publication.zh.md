# Agent Note: 定制风味默认组件包及其发布

Status: implemented

[English](2026-08-20-custom-flavor-default-bundles-and-publication.md) | 中文

## Problem

本 fork 是上游 DeepSeek Harness 的定制风味：交付的 profile 组合与上游完全相同（`dsh-base` + `dsh-web-app` / `dsh-headless`），因此 `dsh-fabric` 和 `dsh-fovea` —— 本风味存在的意义 —— 只有通过手动 `dsh plugin --profile web add <path>` 或同级仓库的 `install:local` 脚本才能到达用户。自 `0.1.0-rc.5` 起没有任何发布，尽管仓库已推进到 `0.1.0-rc.7`；`dsh-fabric`、`dsh-fovea` 以及所有 `@dsh-fabric/*` 包在 npm 上都不存在。同级清单按原样无法发布：每个 `@monotykamary/*` 依赖都使用指向本检出的 `link:` 协议，`pnpm pack` 原样保留，而 npm 消费者会相对自己的目录树解析。

## Decision

### 交付的 profile 即定制组合

`PROFILE_TEMPLATES.web` 为 `['@monotykamary/dsh-base', '@monotykamary/dsh-web-app', 'dsh-fabric', 'dsh-fovea']`，`PROFILE_TEMPLATES.headless` 为 `['@monotykamary/dsh-base', '@monotykamary/dsh-headless', 'dsh-fabric', 'dsh-fovea']`。两个组件包都是 `dsh` 应用的依赖，因此与每个随附组件包一样从安装锚点解析；`healProfilesModuleFallback` 把它们（连同其 `dsh-fabric-*` 与 `@monotykamary/*` 闭包）符号链接进 `$DSH_HOME/profiles/node_modules`。`INSTALLATION_OWNED_PROFILE_TUPLES` 记录了变更前的精确 web 元组，因此既有的自动初始化 web profile 会在下次启动时迁移到新组合，而任何用户改过的列表保持不动。

### 本地开发默认解析已发布的组件包

harness 工作区从 npm 解析 `dsh-fabric` 与 `dsh-fovea`；此处原先记录的同级 `link:` override 对已由 [npm 默认的 custom-flavor 解析](2026-08-20-npm-default-custom-flavor-dev-install.zh.md) 取代，活链接降级为不提交的自选项。pnpm 不安装 `link:` 解析包的依赖，这一性质对自选路径仍然正确：每个同级检出携带自己完整的安装（其自身 overrides 将 `@monotykamary/*` 钉回本检出），Node 跟随符号链接的解析能从链接后的真实位置到达那些包。

### fabric 系列以无 scope 名称发布

七个 fabric 包在 `dsh-fabric` 伞形组件包下以无 scope 名称发布（`dsh-fabric-protocol`、`dsh-fabric-compaction`、`dsh-fabric-host`、`dsh-fabric-mesh`、`dsh-fabric-system-prompt`、`dsh-fabric-code-runtime-quickjs`、`dsh-fabric-client-ui`）。原本的 `@dsh-fabric/*` scope 无法创建：npm scope 是只能在网站上创建的产物，而发布 token 是绕过 2FA 的细粒度 token，因此每次向缺失 scope 的发布都回答 `404 Scope not found`。无 scope 名称无需 scope 即可发布。

### 同级包以 semver 范围发布

`dsh-fabric`（根与七个包）和 `dsh-fovea` 中的每条 `link:` 规格都换成了真实范围：`@monotykamary/cordis` 为 `^4.0.1`，`@monotykamary/schemastery` 为 `^3.18.1`，所有 `@monotykamary/dsh-*` 为 `^0.1.0-rc.7`。它们的 `pnpm-workspace.yaml` 带有恢复活链接的 overrides，因此开发流程不变，而打包后的清单可被消费。fabric 内部的 `workspace:` 范围保持不变 —— `pnpm pack` 会重写它们。

### 发布顺序

harness 家族先发布（`dsh` 家族以 `0.1.0-rc.7` 执行 `release:pack` + `release:publish`，预发布打 `--tag next`，之后再把 `latest` 移到 `0.1.0-rc.7`），然后是七个 `dsh-fabric-*` 包与 `dsh-fabric` 伞形包（按拓扑序，`workspace:` 重写为 `^0.1.0`），最后是 `dsh-fovea`（`0.2.0`）。harness CLI 的 `dsh-fabric: ^0.1.0` 与 `dsh-fovea: ^0.2.0` 依赖只有在这些发布落地之后才能解析。

## Alternatives considered

### 把同级仓库设为 harness 的 workspace 成员

把 `../dsh-fabric`、`../dsh-fabric/packages/*` 与 `../dsh-fovea` 加进 harness 的 `packages:` 列表可以让 `workspace:` 范围跨仓库，但会耦合两个安装：harness 的 lockfile 将接管同级仓库的依赖图，而每个仓库自己的 `pnpm install` 会与 harness 对同一 `node_modules` 的视图相互打架。`link:` overrides 让各仓库相互独立，同时在运行期解析一致。

### 原样发布 `link:` 清单

npm 在发布时接受 `link:` 规格符，但消费者会相对自己的项目解析它，因此发布的 `dsh-fabric` 会为除碰巧与作者共享 `../deepseek-harness` 布局的机器之外的所有人装上断链。

### 用脚本在发布时改写清单

prepublish 变换（link: → 范围、发布、还原）让签入的清单保持作者本地形态，但打包字节将取决于发布机器的状态，还原后的目录树会静默偏离已验证与已发布的内容。

## Consequences

安装已发布的 `@monotykamary/dsh` 现在会拉入 `dsh-fabric` 与 `dsh-fovea`，每个自动初始化的 profile 都会组合它们；上游同步合入必须留意模板列表与应用依赖，任何未来的 fabric/fovea 发布都要求 harness 家族先行协调发布。没有同级目录的 harness 检出也能安装并组合 profile —— 两个组件包从 npm 解析；钉住它们需要 [npm 默认的 custom-flavor 解析](2026-08-20-npm-default-custom-flavor-dev-install.zh.md) 中的自选 overrides。原本声称的钉死变体硬性失败从未存在 —— pnpm 11 对缺失的 `link:` override 目标是静默跳过的 —— 所以没有同级目录的检出会干净地安装，却以两个组件包缺席的状态启动。同级仓库自己的 `install:local` 脚本钉住 `@monotykamary/dsh@0.1.0-rc.7`，该版本只有在 harness 发布后存在。
