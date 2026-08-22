# `@monotykamary/dsh-distribution-update`

[English](README.md) | 中文

Host 提供方：投影已安装发行版、缓存 npm Registry 检查、提供安装渠道指引，并为 npm 全局安装或源码检出启动分离更新。`appManifest` 为必填项，指向运行中的 `@monotykamary/dsh` 清单。`registryUrl`、`checkOnStartup`、`checkIntervalMs` 与 `requestTimeoutMs` 均可由部署配置。

Registry 失败会保留为诊断，不会停止 Harness。只有目标语义化版本大于已安装版本时才可操作；兼容依赖范围与较旧预发行版绝不会提供降级。检测到的 npm 全局安装与源码安装会通过分离 Worker 自更新；源码更新从仓库根目录执行仅快进拉取、安装与构建。Npx、Nix 与未知安装仍由外部管理。Worker 会移除类似凭据的环境变量，在首次失败时停止，在 `$DSH_HOME/updates/status.json` 写入仅所有者可读的进度，且不会重启 Harness。

## 模型体验

无；该更新提供方仅面向操作者，不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；该包从不组装模型输入。

## 已知限制与待办事项

- 分离 Worker 会记录完成状态，但安装替换运行包后，当前浏览器页面不会流式读取进度。
- 回滚仍需显式执行包管理器或源码控制操作。
