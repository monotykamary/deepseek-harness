# `@monotykamary/dsh-client-ui-settings-updates`

[English](README.md) | 中文

`distributionUpdate` 的 Web 设置 Consumer：添加更新页面，在设置入口 Badge 挂载时检查 Registry，并在任一托管包与最新 Registry 标签不同时标记设置。页面显示安装渠道、已安装与最新版本、渠道命令，以及支持时的分离更新操作。

## 模型体验

无；该浏览器设置包仅面向操作者，不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；该包从不组装模型输入。

## 已知限制与待办事项

- npm 分离更新完成后需要重启 DSH；旧页面不会流式读取 Worker 状态文件。
