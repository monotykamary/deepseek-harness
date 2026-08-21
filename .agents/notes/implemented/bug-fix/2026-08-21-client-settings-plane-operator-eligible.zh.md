# Agent Note：客户端设置平面跟随运营者可达表面

Status: implemented

[English](2026-08-21-client-settings-plane-operator-eligible.md) | 中文

## 问题

[特权面信任部署表面决策](../architecture/2026-08-18-privileged-plane-trusted-surfaces.md)在 /api 栅栏上把整个配置平面——`settings.*`、`credentials.*`、`host.*`、agent-preset 创作——开放给部署的可信表面（tailnet、portless、`--trusted-host`），并承诺 `dsh web --portless`／--tailnet 表面可以加载和保存 Models 提供方目录。栅栏半边落地了，浏览器半边没有。客户端设置传输仍然以 `connection.isLoopback` 为门槛，而该判定只把精确的 `localhost`／127/8／`[::1]` 主机名归类为回环（`isLoopbackHostname`）：在 `https://dsh.localhost`（portless 别名，解析到回环地址）和 `https://<node>.ts.net` 上，describe 镜像保持进程内（memory）模式，从不发出 `settings.describe`，Models 页面因此报错「加载提供方目录失败：settings are unavailable in this browser」。栅栏从来不是瓶颈——`llm.providers`（非特权）在这些表面是成功的；只是客户端从不发起请求。

## 决策

/api 载体现在为每个 `host.describe` 应答标注该请求的运营者可达性判定：`operatorEligible`，用特权门禁完全相同的准入表达式计算（属主为 null 且（运营者 Bearer 令牌或可信表面））。裸载体与进程内载体保持该字段缺省。`ctx.connection` 暴露 `isOperatorEligible`，一个可观察源：从启动时的回环事实出发，跟随握手——带标注的 describe 到达时可信表面将其翻转为真，generation 失效时随描述一起撤回。

`dsh-client-ui-settings` 据此构建 describe 镜像与所有绑定 scope，取代构造期的 host/memory 二选一：只有判定成立时读取才跨线路；不受信任的页面把镜像停在 `unavailable`（即那句友好的「settings are unavailable in this browser」），写入保持惰性；可信表面在首次握手后把镜像翻转开启，并随之发起一次读取。设置文档打开操作与 deliverables 原生打开门禁同样跟随该平面，使可信表面获得 2026-08-18 决策承诺的完整特权面 UI。

## 备选方案

**把 `*.localhost` 归类为回环。** 否决——`loopback-hostname.client.spec.ts` 已将其安全地固定为假（`remote.localhost` 必须保持假）：一刀切的授权会让任何 `.localhost` 名称下的本地页面在部署未点名的情况下触及特权面，而这正是派生权威流程要守住的信任边界。

**总是尝试读取并把 403 映射为「不可用」。** 否决：会把瞬时读取失败与终态不可用混为一谈，让每次不受信任的启动都发出一次特权探测，并用传输错误文案取代刻意的终态。

**在启动载荷中发布可信权威列表，由客户端自行计算可达性。** 否决：改动 `__DSH_BOOT__` 线上类型，且覆盖不了运营者令牌场景；服务端本就在逐请求计算判定，握手标注只是一个字段。

## 影响

`host.describe` 新增可选的 `operatorEligible` 字段，仅由 /api 载体逐请求标注。`dsh web --portless`（`https://dsh.localhost`）与 `--tailnet` 表面现在可以加载并保存 Models 提供方目录、编辑设置、管理凭据、打开设置文档，无需身份提供方——即 2026-08-18 决策记录中的 GUI 后果。不受信任的来源保持终态不可用，且从不发送特权读取。回环冷启动 describe 预算不变（镜像仍按首次读取加首次连接读取各一次）。各包 README（ui-settings、ui-settings-general、ui-workspace、locale、ui-theme、ui-deliverables、connection）已更新「远程浏览器仅限 loopback」的旧表述。覆盖：node-half host 规格断言可信与回环权威的逐请求标注以及未声明权威的 403；connection client 规格断言启动事实与握手翻转；ui-settings 镜像/scope 规格覆盖不可用终态、翻转读取与持视图暂停；web e2e `trusted-surface-settings` 以 `dsh.localhost` 作为可信权威启动 GUI，扫过全部设置分区（通用设置、模型、插件、Agent 预设），断言每个分区都能加载且提供方目录失败提示永不出现；tailnet e2e 断言经派生权威的标注。
