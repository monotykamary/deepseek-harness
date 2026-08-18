# Agent Note: 移除内部测试声明

Status: implemented

[English](2026-08-18-remove-testing-stage-welcome-notice.md) | 中文

## 问题

GUI 每次首启都会先显示共用弹窗的内部测试声明（内测声明）：「DeepSeek Harness 目前的 0.1 版本仍处在面向 Harness 开发者进行测试的阶段」，先于 DeepSeek 凭据步骤出现。这是发布前的定位表述，对非 Harness 开发者用户没有任何可执行动作，而产品不再以内部测试身份呈现自己。

## 决策

从 `settings.onboarding` 中移除 `welcome-notice` 步骤，而不是改写。`ui-settings-models` 不再注册该步骤；其组件（`WelcomeNotice`）、确认 store（`welcome-store.ts`）、文案所有者（`onboarding-copy.ts`）、locale 键及其包级与浏览器 e2e 覆盖均被删除。`ui-settings-general` 继续注册 `ui-onboarding` namespace 及其 `welcomeNoticeVersion` 字段，使既有设置文档保持有效，与更早的[移除首次启动内测声明](2026-08-13-remove-first-run-beta-notice.md)做法一致。`deepseek-official` 凭据步骤与共用 `OnboardingModal` 保持不变；全新回环 GUI 直接进入凭据步骤（或就绪应用），不再有插页。

## 曾考虑的替代方案

**用配置开关让步骤休眠。** 不予采用：这是产品不再呈现的发布前定位表述，休眠步骤会把确认 seam、文案、测试和 schema 表面留在已发布 bundle 里，只为无人会看到的弹窗服务。重新引入可以在不变的字段上注册新的 `settings.onboarding` 步骤。

**连 `ui-onboarding` namespace 与字段一起注销。** 沿更早移除的先例不予采用：既有设置文档已经包含该分节，而设置 seam 会用已注册的 namespace 校验存储文档；保留注册就能让这些文档继续有效，且没有额外成本。

## 后果

全新 profile 不再看到内部测试插页；DeepSeek 凭据步骤成为唯一的引导弹窗。`ui-onboarding.welcomeNoticeVersion` 字段在宿主端继续注册，以保持文档兼容。[版本化 GUI 欢迎引导](../feature/2026-07-30-versioned-gui-welcome-onboarding.md)与[共用弹窗产品引导](../feature/2026-08-13-shared-modal-product-onboarding.md)两个决策在欢迎步骤上被部分取代，其余表面继续有效；本笔记持有移除理由。重新引入走同一 seam：在 `settings.onboarding` 中注册新步骤，复用不变的版本化字段。
