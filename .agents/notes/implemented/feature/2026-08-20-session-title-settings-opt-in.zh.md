# Agent Note: 会话标题设置开关

Status: implemented

[English](2026-08-20-session-title-settings-opt-in.md) | 中文

## 问题

随产品发布的 Web 组合无条件启用了自动 LLM 会话标题：每个新会话都会支付一次辅助模型调用（最多 64 个输出 token）来为侧边栏行生成标题。标题模型从来不是用户的选择——它静默跟随会话主请求路由——而且除了修改组合包补丁外，辅助请求没有关闭开关。产品与用户都需要默认关闭该能力，并在设置弹窗中提供一等开关。

## 决策

自动标题生成在任何地方都是可选项。共享的 `SessionTitleLlmConfig` schema 携带 `enabled` 字段，产品默认值为 `false`；基础组合包在 `session-title-llm` 行上显式重述 `enabled: false`，ACP 会话标题示例则以 `enabled: true` 选择启用。

提供方插件通过 `dsh-session-title-llm` 中新增的、以设置为门槛的辅助函数 `registerSessionTitleLlmSettingsProvider()` 注册。它拥有一个 `session-title-llm` 设置命名空间，并且只在解析后的区段具有 `enabled: true` 时挂载提供方：没有设置提供方时以组合条目为准，有则通过 `installSettingsSection` 实时生效。关闭只在进行中的标题调用安静结束后才完成；在该窗口内重新开启会等待旧注册真正释放后再挂载，因为标题服务在旧注册关闭期间拒绝新注册。`registerSessionTitleLlmProvider()` 现在返回注册的释放函数。

Web 表面在通用设置区拥有一个新 `ui-session-title` 客户端插件贡献的行：标题、说明与一个绑定到同一 `session-title-llm` 命名空间的 `aria-pressed` 开关。一次手势先发布实时值，再写入 `enabled` 字段；宿主提供方在同一提交上挂载或卸载，因此该开关就是随产品发布的启用入口。web e2e scaffold 不再禁用提供方行——默认关闭的门槛已经阻止其即发即忘的标题调用与回放游标竞争——settings-chrome 场景通过持久化文档翻转该行。

## 后果

关闭自动标题不产生任何代价：确定性回退仍然为每个会话生成标题，且模型可见输入不变。开启的代价是每个新会话一次辅助调用、至多 64 个输出 token，使用会话自身路由，除非部署固定 `provider`/`model`。`session-title-llm` 区段进入 `$DSH_HOME/settings.yaml`，与其他命名空间一样热加载。希望默认开启标题的部署在补丁层设置 `enabled: true`，而不是修改插件。

## 验证

first-prompt 设置 spec 固定默认关闭行为、通过真实设置提供方实时挂载/卸载，以及待决释放期间的重新注册竞态。提供方 spec 与 ACP 会话标题快照原样覆盖启用路径。客户端行 spec 覆盖开关手势与作用域采纳，settings-chrome e2e 翻转该行并断言持久化文档。

## 备选方案

**仅通过组合禁用该行。** 被禁用的组合行不提供命名空间，设置开关无法绑定它；开关必须是实时设置，GUI 才能存在。

**通过每会话标志启用。** 标题是全新会话节奏；文档级开关与随产品发布的 `first-prompt` 提供方匹配，并把开关集中在一处。
