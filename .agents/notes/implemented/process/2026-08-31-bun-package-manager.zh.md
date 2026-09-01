# Agent Note: Bun as the sole repository package manager

Status: implemented

[English](2026-08-31-bun-package-manager.md) | 中文

## Problem

仓库中的包管理器表面已经扩散到 workspace 发现、依赖链接、生命周期脚本信任、CI 配置与缓存、发行打包、生成的 consumer fixture、Python runtime 组装、本地 Git hook，以及数百条贡献者命令。如果外部 DSH 项目统一使用 Bun，而 Harness 仍保留 pnpm，同一个开发依赖图中就会存在两种锁文件格式和两套命令方言。仅做文本替换并不安全：Bun 的 workspace filter、可执行文件重入、isolated linker、受信任生命周期脚本和 `pm pack` 工作目录规则都与 pnpm 不同。

旧锁文件还包含 Bun 1.4 无法迁移的相对 `link:` 记录。即使 manifest 没有变化，重新解析所有 semver 范围也可能改变 runtime 行为；Zod 的递归 lazy schema 行为证明了这一风险。因此，这次迁移必须让 Bun 原生拥有整个流程，并以行为验证收口，而不是在旧管理器外包一层兼容别名。

本决策取代历史上的 [pnpm 取代 Yarn 决策](../../archived/process/2026-06-16-pnpm-over-yarn.md)、[pnpm CI 配置决策](../../archived/process/2026-07-26-pnpm-action-setup-for-symmetric-ci-caching.md)，以及 [pnpm runner 隔离修复](../../archived/bug-fix/2026-07-29-pnpm-setup-runner-isolation.md)。

## Decision

Bun 1.4.0 是仓库唯一的包管理器，并由根 `packageManager` 字段固定。`package.json` 拥有完整 workspace glob，`bun.lock` 是唯一活跃的包管理器锁文件，所有可复现安装都使用 `bun install --frozen-lockfile`。根 manifest 与 website manifest 在 Node runtime engine 之外同时声明 Bun engine。

`bunfig.toml` 选择 Bun 的 `isolated` linker，使未声明的 phantom import 继续失败，而不是从扁平依赖树中被意外满足。`trustedDependencies` 是明确的安装脚本 allowlist。同一发行波次的 DSH bundle、原生 loader 包和选定浏览器包列在 `minimumReleaseAgeExcludes` 中；该列表只绕过环境中的 minimum-age 策略，不会削弱锁文件完整性。Workspace 引用继续使用 `workspace:`，因此 `bun pm pack` 会替换成成员的实际发布版本。

由于旧锁文件含有不受支持的相对 `link:` 记录，Bun 无法导入它。仓库因此拥有全新的原生锁文件，并把完整确定性 gate 清单作为迁移证明。对兼容性敏感的解析结果必须显式记录：根 `overrides` 把 Zod 固定在 4.4.3，把 Vitest 及其 coverage companion 固定在 4.1.11，并把 Vitest 的 Vite 子依赖固定在 8.2.2；根开发依赖保留 Knip 6.16.1 与 tsdown 0.22.2，而应用 Vite 保持 6.4.3。Zod 会保持固定，直到递归 schema-emitter 测试能在更新版本上通过；当前 Vitest module runner 支持仓库的动态 `import.meta.resolve` 契约；analyzer/build pin 则保留迁移前行为。依赖升级是独立审查的变更，不能成为切换包管理器的偶然副作用。

所有脚本、hook、workflow、发行工具、文档与生成 fixture 都直接调用 Bun。GitHub Actions 使用 `oven-sh/setup-bun` 配置它，不再需要 Corepack 或包管理器专用的 Node cache action。递归启动当前包管理器的代码使用 [`scripts/bun-invocation.ts`](../../../../scripts/bun-invocation.ts)，读取 Bun 的 `npm_execpath`，并返回用于无 shell spawn 的 command/argument vector。JavaScript launcher 通过 Node 重入；原生 Bun 可执行文件则直接启动。生命周期身份缺失时会明确失败，而不会从 `PATH` 猜测。

`bun pm pack` 通过子进程的 `cwd` 选择工作目录；脚本不会传递不受支持的包管理器 `--cwd` 参数。本地 profile installer 使用绝对 `file:` 依赖，因为 Bun 不支持旧的相对链接流程。当 Bun 隔离使可选平台 binding 无法出现在 helper 的词法作用域时，Cordis Loader 的内部模块桥接会从 wrapper 包自身的依赖作用域解析该 binding。原生包和外部包兼容代码仍可识别历史 npm 或 pnpm 安装路径，但仓库的构建、测试、文档或发行任务都不再依赖这些管理器。

Vitest worker 通过共享 `execArgv` 直接接收 `--expose-internals`，从而保留 Cordis Loader 与 HMR 测试，同时避免把 `NODE_OPTIONS` 泄漏给子进程。同一个 vector 还保留由 [Web Storage 测试决策](../testing/2026-07-30-vitest-jsdom-webstorage-ownership.zh.md) 拥有的条件式 `--no-webstorage` 隔离。

## Verification

Bun-only invocation 测试会拒绝活跃的 pnpm 命令，并验证原生与 JavaScript Bun launcher。Workflow contract 测试固定 Bun setup、frozen install、cache 行为、pack 语法和生成项目命令。Workspace constraint、文档同步、类型检查、lint、unit 与 snapshot suite、client 构建、原生发行打包、package payload 检查和 consumer 安装共同覆盖迁移路径。`bun install --frozen-lockfile` 是直接的锁文件可复现性探针。

## Alternatives considered

**Harness 保留 pnpm，仅外部 plugin 使用 Bun。** 拒绝，因为本地源码链接、CI 复现与发行测试会跨越两套锁依赖图，继续保留本次迁移正要消除的分裂。

**保留转发到 Bun 的 pnpm 别名。** 拒绝，因为别名会隐藏陈旧自动化、保留 `dlx` 和 `--filter ... exec` 等无效语义，并让失败取决于 shell 配置。

**使用 Bun hoisted linker 以缩小迁移。** 拒绝，因为扁平依赖树可能满足未声明依赖，从而丢弃上一套 workspace 保留下来的严格依赖所有权保证。

**为 Loader 测试全局设置 `NODE_OPTIONS`。** 拒绝，因为它会把 test-runner 策略传播到每个子进程。Vitest worker 的 `execArgv` 把要求限制在真正需要它的进程中。

**不经针对性比较就接受所有重新解析出的 semver 版本。** 拒绝，因为 Zod 回归表明包管理器迁移可能静默变成依赖升级。行为失败必须通过显式 pin 或独立的兼容代码变更解决。

## Consequences

贡献者与自动化需要 Bun 1.4.0，并共享一套命令词汇、一种 workspace 模型和一个锁文件。CI 不再存在可被多个 self-hosted runner 并发替换的共享包管理器安装目录。无 shell 重入适用于 Bun 原生可执行文件，并且仍可作为纯 command-vector 决策进行测试。

原生锁文件并非旧 pnpm 依赖图的逐字节派生，因此迁移包含大型依赖 diff，必须通过精确 pin 与完整 gate 清单判断。Isolated linking 可能暴露 hoisted 安装曾掩盖的缺失声明。添加原生包或同一发行波次包时，需要维护 trusted dependency 与 minimum-age 列表。历史 pnpm note 保持密封归档；活跃指令与工具则由 Bun 统一拥有。
