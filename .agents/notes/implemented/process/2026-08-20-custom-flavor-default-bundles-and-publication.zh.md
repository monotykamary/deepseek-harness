# Agent Note: 定制风味默认组件包及其发布

Status: implemented

[English](2026-08-20-custom-flavor-default-bundles-and-publication.md) | 中文

## Problem

本 fork 是上游 DeepSeek Harness 的定制风味：交付的 profile 组合与上游完全相同（`dsh-base` + `dsh-web-app` / `dsh-headless`），因此 `dsh-fabric` 和 `dsh-fovea` —— 本风味存在的意义 —— 只有通过手动 `dsh plugin --profile web add <path>` 或同级仓库的 `install:local` 脚本才能到达用户。自 `0.1.0-rc.5` 起没有任何发布，尽管仓库已推进到 `0.1.0-rc.7`；`dsh-fabric`、`dsh-fovea` 以及所有 `@dsh-fabric/*` 包在 npm 上都不存在。同级清单按原样无法发布：每个 `@monotykamary/*` 依赖都使用指向本检出的 `link:` 协议，`pnpm pack` 原样保留，而 npm 消费者会相对自己的目录树解析。

## Decision

### 交付的 profile 即定制组合

`PROFILE_TEMPLATES.web` 为 `['@monotykamary/dsh-base', '@monotykamary/dsh-web-app', 'dsh-tool-repair', 'dsh-multiprovider', 'dsh-fabric', 'dsh-fovea', 'dsh-factory']`，`PROFILE_TEMPLATES.headless` 为 `['@monotykamary/dsh-base', '@monotykamary/dsh-headless', 'dsh-tool-repair', 'dsh-multiprovider', 'dsh-fabric', 'dsh-fovea']`。五个配套 Bundle 都是 `dsh` 应用的依赖，因此与每个随附 Bundle 一样从安装锚点解析；`healProfilesModuleFallback` 把它们及其依赖闭包符号链接进 `$DSH_HOME/profiles/node_modules`。`LEGACY_PROFILE_TUPLES` 识别较早的安装所有元组，并在赋予模板所有权时保留追加的用户层。名称与模板匹配的受管 profile 还会在加载时把当前由模板拥有的每个 Bundle 移出 `dsh.profile.bundles` 并持久化其余条目；扩展随附模板因此能吸收用户已安装的配套 Bundle，而不会把它组合两次，自定义 profile 与重复的纯用户层仍会明确报错。

### 本地开发默认解析已发布的组件包

harness 工作区从 npm 解析 `dsh-tool-repair`、`dsh-multiprovider`、`dsh-fabric`、`dsh-fovea` 与 `dsh-factory`。[npm 默认的 custom-flavor 解析](2026-08-20-npm-default-custom-flavor-dev-install.zh.md)把同级 `link:` override 保留为不提交的自选项。pnpm 不安装 `link:` 解析包的依赖，这一性质对自选路径仍然正确：每个同级检出携带自己完整的安装，Node 跟随符号链接的解析能从链接后的真实位置到达那些包。

### fabric 系列以无 scope 名称发布

九个 Fabric 包在 `dsh-fabric` 伞形 Bundle 下以无 scope 名称发布（`dsh-fabric-protocol`、`dsh-fabric-compaction`、`dsh-fabric-host`、`dsh-fabric-mesh`、`dsh-fabric-models`、`dsh-fabric-schema`、`dsh-fabric-system-prompt`、`dsh-fabric-code-runtime-quickjs`、`dsh-fabric-client-ui`）。原本的 `@dsh-fabric/*` scope 无法创建：npm scope 是只能在网站上创建的产物，而发布 token 是绕过 2FA 的细粒度 token，因此每次向缺失 scope 的发布都回答 `404 Scope not found`。无 scope 名称无需 scope 即可发布。

### 同级包以 semver 范围发布

每个已发布配套组件的 manifest 都为其 Harness、Cordis、Schemastery、React 与同级包依赖携带可从 registry 解析的 semver 范围。配套组件可以在仅供开发的 `pnpm-workspace.yaml` 中保留 overrides，把相邻 checkout 恢复为活链接；打包后的 manifest 仍可移植。Fabric 与 Factory 内部保留 `workspace:` 范围，因为 `pnpm pack` 会把它们改写成发布范围。

### 发布顺序

每个配套组件版本先通过其仓库检查与 payload 检查，再发布到 npm，之后 Harness 应用才固定该版本。Fabric 与 Factory 按依赖顺序发布各自的 workspace 成员。`dsh` 应用会把每个已测试版本记录两次——一次作为精确依赖，一次写入 `dsh.distribution.companions`；发布家族验证器会拒绝缺失、范围化或不一致的固定值。所有精确版本都可解析且组装应用通过后，共享的 dsh 家族版本才会递增、打 tag、打包并从该 tag 发布；稳定版取得 `latest` dist-tag。

## Alternatives considered

### 把同级仓库设为 harness 的 workspace 成员

把 `../dsh-tool-repair`、`../dsh-multiprovider`、`../dsh-fabric`、`../dsh-fovea` 与 `../dsh-factory` 加进 harness 的 `packages:` 列表可以让 workspace 范围跨仓库，但会耦合各自的安装：harness 的 lockfile 将接管每个同级依赖图，而每个仓库自己的 `pnpm install` 会与 harness 对同一 `node_modules` 的视图相互打架。不提交的可选 `link:` overrides 让各仓库保持独立，同时在运行期解析一致。

### 原样发布 `link:` 清单

npm 在发布时接受 `link:` 规格符，但消费者会相对自己的项目解析它，因此发布的 `dsh-fabric` 会为除碰巧与作者共享 `../deepseek-harness` 布局的机器之外的所有人装上断链。

### 用脚本在发布时改写清单

prepublish 变换（link: → 范围、发布、还原）让签入的清单保持作者本地形态，但打包字节将取决于发布机器的状态，还原后的目录树会静默偏离已验证与已发布的内容。

## Consequences

安装已发布的 `@monotykamary/dsh` 会拉入精确测试过的 Tool Repair、Multiprovider、Fabric、Fovea 与 Factory 版本。每个自动初始化的 profile 都组合前四者，Web 还组合 Factory。上游同步合入必须一并保留模板列表、应用依赖、配套元数据、更新清单与发布验证器。未来配套版本只有在自身完成验证与发布、应用精确固定该版本且 dsh 家族通过组装发布序列后，才会进入 `@monotykamary/dsh@latest`。源码 checkout 无需同级目录也能安装并组合；活链接协同开发仍是显式的本地 override。
