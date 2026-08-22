# `@monotykamary/dsh-client-ui-settings-updates`

[English](README.md) | 中文

`distributionUpdate` 的 Web 设置 Consumer：添加更新页面，在设置入口 Badge 挂载时检查 Registry，并在经过测试的发行版存在语义化升级时标记设置。在模型设置之前，它的有序 onboarding 步骤会读取启动诊断快照；shell、沙箱或 DSH home 未就绪时会阻塞应用，用户可以明确选择仍然继续，而更新页面会保留每项检查与修复指引。页面显示安装渠道与升级，为 npm 全局安装和源码安装提供分离更新操作，并且只为外部管理的安装显示渠道指引。卡片和状态文本使用共享主题 token，重试、检查与更新操作使用共享 `Button` 变体。

## 模型体验

无；该浏览器设置包仅面向操作者，不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；该包从不组装模型输入。

## 已知限制与待办事项

- 分离更新完成后需要重启 DSH；旧页面不会流式读取 Worker 状态文件。
