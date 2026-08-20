# @monotykamary/dsh-client-ui-session-title

[English](README.md) | 中文

Web 端会话标题偏好插件：其浏览器半边在通用设置区注册 `session-title` 行。该行绑定宿主拥有的 `session-title-llm` 设置命名空间，并切换自动 LLM 标题开关；宿主侧的提供方插件（`dsh-session-title-first-prompt-llm`、`dsh-session-title-all-prompts-llm`）从同一区段挂载，因此该开关就是随产品发布的启用入口。自动生成默认关闭；关闭后仍保留确定性的回退标题。宿主半边有意为空——纯浏览器表面不需要宿主行为。

该行渲染标题、说明与一个 `aria-pressed` 开关，其状态跟随持久化区段。一次手势先发布实时值，再通过设置作用域的 `set` 写入 `enabled` 字段；宿主侧变更（其他表面、设置文档、重连）会重新采纳已接受的值。若组合没有提供 `session-title-llm` 命名空间，该行显示关闭状态，写入静默失败。

文案为双语：插件在 `dsh-client-locale` 的 `settings.sessionTitle` 命名空间下注册中英文词典。

## 模型体验

间接地，经由该开关选入的宿主标题提供方发起，其辅助请求由 [dsh-session-title-llm](../../session/session-title-llm/README.md#model-experience) 说明。

#### KV Cache 影响

不直接使缓存失效；辅助缓存效果由宿主提供方负责。

## 已知限制与暂缓事项

- 该行只提供一个开关；已挂载提供方的目标长度与路由策略仍是组合层字段。
