# Agent Note: 终端调色板跟随应用外观

Status: implemented

[English](2026-08-20-terminal-follows-appearance.md) | 中文

## 问题

交互式终端原本有独立主题选择器：四个可选 xterm 调色板（Harness、Tokyo Night、Catppuccin、Light），按浏览器 profile 持久化在 `dsh.terminal.preferences.v1` 下。该选择与应用的外观设置（浅色/深色/跟随系统）彼此独立，因此终端可能在应用为浅色时仍是深色，反之亦然；对一个本就该与所在应用保持一致的表层来说，这个选择器还多了一份需要解释和维护的设置。

## 决策

终端不再有主题选择器，也没有用户自选的调色板。调色板根据应用外观自动解析：主题服务解析出的活动配色方案（`ctx.theme.getTheme().active.colorScheme`）在两个内置调色板之间选择——深色 Harness 调色板与浅色调色板（`ui-terminal/src/client/themes.ts` 中的 `terminalTheme(colorScheme)`）。浏览器插件在 slot `hooks` 舱里与偏好 store 并列提供一个共享可观察源 `TerminalColorSchemeSource`：它先读取一次初始快照，随后跟随 `theme/change` 事件（偏好切换以及偏好为 `system` 时系统配色翻转都会触发该事件）。`XtermSurface.apply()`、构造函数调色板与面板主体背景都使用解析出的配色方案，浅色调色板下 `minimumContrastRatio` 翻转为 4.5。

`TerminalPreferences` 不再包含 `theme` 字段；设置对话框移除 Theme 下拉与 `settings.theme` 语言键。旧的浏览器本地记录即使仍含 `theme` 键也会原样解析并忽略该键，因此现有 profile 无需迁移。插件的服务 inject 列表与 manifest 增加主题服务（`'theme'` / `@monotykamary/dsh-client-ui-theme`），包 README 记录了跟随外观的行为。

## 曾考虑的替代方案

- **保留选择器并增加自动选项。** 否决：目标是终端完全不做主题选择——外观只有一个权威（应用的），且该权威已由主题服务持有。
- **终端直接读 DOM**（`body[data-ds-dark-theme]` 加媒体查询）。否决：主题服务已经解析 `system` 并在变化时重新发事件；在终端里重复感知会制造第二个、可能漂移的权威。
- **保留 Tokyo Night/Catppuccin 作为内置调色板但不提供选择器。** 否决：没有消费者证据支持保留用户无法选择的调色板；跟随外观只需两个调色板（深色 Harness 与浅色）。

## 后果

终端主题与应用始终一致：切换外观（或在 `system` 下切换系统配色）会让所有已挂载终端实时换肤，无需重建 xterm。偏好表层减少一个字段，旧 localStorage `theme` 值在下一次写入时被静默丢弃。新增的主题服务依赖让终端插件等待 `ctx.theme`，应用启动时已提供该服务。深/浅调色板二分是明确的产品决策：第三方终端调色板不再是受支持的表面，若要加回，需要重新引入偏好字段与选择器。

## 测试

apply spec 通过 `theme/change` 驱动 `TerminalColorSchemeSource`，并断言 hook 快照跟随解析出的配色方案；viewport spec 固定两种方案下的背景色与 `surface.apply` 参数；preferences spec 固定旧键容忍（存储的 `theme` 字段被忽略）；interactive-terminal e2e 断言设置对话框不再提供 Theme 下拉，并更新了无障碍 golden。
