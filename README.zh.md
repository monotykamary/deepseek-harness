<div align="center">

# 🐟 DeepSeek Harness

**一个插件原生的编程 Agent Harness，内置稳健工具调用、Fabric 协作能力与 Fovea 仓库智能。**

_一条命令即可本地运行；所有能力均可组合，经过测试的发行版始终一起更新。_

[![CI](https://img.shields.io/github/actions/workflow/status/deepseek-ai/deepseek-harness/ci.yml?branch=master&style=for-the-badge&label=checks)](https://github.com/deepseek-ai/deepseek-harness/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@monotykamary/dsh?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@monotykamary/dsh) [![Node.js](https://img.shields.io/badge/Node.js-%5E22.19%20%7C%7C%20%3E%3D24-339933?style=for-the-badge&logo=node.js&logoColor=white)](package.json) [![license](https://img.shields.io/badge/license-MIT-f4c430?style=for-the-badge)](LICENSE)

[English](README.md) | 中文

</div>

<a id="run"></a>

## 运行

```sh
npx @monotykamary/dsh@latest web
```

DSH 会在 `http://127.0.0.1:3080` 启动 Web UI；本机启动时还会用默认浏览器打开页面，通过 SSH 启动时则只打印宿主机 URL，传入 `--no-open` 可仅运行服务器。npm 包携带完整且经过测试的依赖闭包：[dsh-tool-repair](https://github.com/monotykamary/dsh-tool-repair)、[dsh-fabric](https://github.com/monotykamary/dsh-fabric) 与 [dsh-fovea](https://github.com/monotykamary/dsh-fovea) 会加入每个随附 profile，长生命周期 Web profile 还包含 [dsh-factory](https://github.com/monotykamary/dsh-factory)；profile 不会固定它们的独立副本。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

## 为什么选择 DSH？

| | 能力 | 作用 |
| :-: | --- | --- |
| 🧩 | **一切皆插件** | 通过 Cordis 组合替换模型、工具、持久化、策略、UI 与编排。 |
| 🩹 | **内置工具修复** | 在记录或执行前重新校验无歧义的提供方格式修复；拒绝被截断的工作。 |
| 🧠 | **内置 Fabric** | 确定性压缩、受检代码执行、持久协作与实时拓扑。 |
| 🔭 | **内置 Fovea** | 渐进式仓库导航与影响分析，无需批量读取代码树。 |
| 🛡️ | **执行时策略** | 文件系统、子进程、审批、超时与沙箱决策均由可执行能力约束。 |
| 🔄 | **整体更新** | 设置与 CLI 同时报告 DSH 及每个已测试 Companion，并保留安装渠道。 |
| 🧱 | **配置档分层** | 内置模板持续更新，用户补丁与外部 Bundle 保持独立所有权。 |

## 组合方式

```mermaid
flowchart LR
  User[CLI or Web] --> Profile[Managed profile template]
  Profile --> Core[DSH plugin spine]
  Profile --> Repair[Tool Repair]
  Profile --> Fabric[Fabric]
  Profile --> Fovea[Fovea]
  Core --> Model[Model providers]
  Core --> Tools[Policy-guarded tools]
  Core --> Sessions[(Durable sessions)]
  Fabric --> Mesh[(Durable mesh)]
  Fovea --> Repo[Repository graph]
```

Cordis 管理插件生命周期与可逆副作用；会话日志保存模型可见的持久事实。配置档依次叠加当前安装拥有的模板、用户 Bundle、配置档补丁、主目录补丁与命令行覆盖。详见[架构文档](docs/architecture.zh.md)。

## 安装

### 免安装运行

```sh
npx @monotykamary/dsh@latest web
```

### 安装命令

```sh
npm install --global @monotykamary/dsh@latest
dsh web
```

### Nix

```sh
nix run github:deepseek-ai/deepseek-harness
```

Flake 固定当前检出版本对应的 npm 发行版。打包部署应设置 `DSH_INSTALL_CHANNEL=nix`，让设置页报告由 Nix 管理的更新，而不是提供 npm 自更新。

<a id="run-from-source"></a>

### 从源码运行

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## 更新与诊断

```sh
dsh version
dsh version --json
dsh update --check
dsh update
dsh doctor --json
```

Web 设置面板包含**更新**页面；任一托管包出现新版时，设置入口会显示标记。npm 全局安装可把安装工作交给分离进程；npx、Nix、源码与未知安装会显示其所属渠道的更新命令。DSH 不会静默替换自身，也不会重启正在运行的会话。

## 配置档与插件

内置 `web` 与 `headless` 配置档从当前 DSH 安装解析模板，因此应用更新也会更新其经过测试的 Tool Repair、Fabric 与 Fovea 层。`$DSH_HOME/profiles/<name>/package.json` 只保存模板标识与用户管理的 Bundle；`cordis.patch.yml` 仍是用户的覆盖层。

```sh
dsh --profile web --dump-config
dsh plugin --profile web add <package>
dsh plugin --profile web remove <package>
```

请为插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 主题。[扩展教程](docs/cookbook/extension-cookbook.zh.md)介绍包、工具、模型提供方、设置卡片与浏览器界面。

## 文档与社区

- [Web UI 指南](docs/user/guide/index.zh.md)
- [架构](docs/architecture.zh.md)
- [开发指南](docs/development.zh.md)
- [参与贡献](CONTRIBUTING.zh.md)
- [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)
- [Discord](https://discord.gg/Ycq5dCaS4)

> [!WARNING]
>
> DSH 目前处于开发者预览阶段；首次稳定版本发布前可能出现不兼容变更。

## 许可证

MIT © DeepSeek 贡献者。第三方许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
