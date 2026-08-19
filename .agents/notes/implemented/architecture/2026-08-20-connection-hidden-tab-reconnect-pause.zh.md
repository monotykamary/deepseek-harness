# Agent Note: Connection reconnect pause in hidden tabs

Status: implemented

[English](2026-08-20-connection-hidden-tab-reconnect-pause.md) | 中文

## Problem

ConnectionController 的重连循环会无视标签页可见性，以带抖动、上限为十秒的指数退避无限重试断开的连接。主机不可达时，后台标签页仍会持续重建两条事件流并调用 `host.describe`，每分钟数次且永无休止——这些 CPU、电量与主机负载花在没有人观察的重试上。同一循环还有第二个生命周期缺口：`stop()` 只中止当前 generation 的流，不会中止仍在计时的退避 sleep，因此退避期间关闭要等完剩余延迟；快速 `stop()` 再 `start()` 时，仍在沉睡的旧循环会醒来进入已重启的 controller，开出第二个并发 generation。

## Decision

文档隐藏（`document.visibilityState === 'hidden'`）时，退避 sleep 被替换为对 `visibilitychange` 的等待；重新可见时立即重连，因为延迟在隐藏期间已经流逝。已启动的 controller 首次尝试始终执行，后台启动或恢复的标签页仍会完成初次握手。没有 document 的环境（node 测试、非浏览器载体）按可见处理。`stop()` 会中止一个同时覆盖退避 sleep 与可见性等待的共享 `AbortController`，并递增 loop epoch；`start()` 以新 epoch 启动新循环，循环在每次可能被重启跟随的 await 之后复查 epoch，因此停在等待中的旧循环在重启后不可能重新打开流。

## Alternatives considered

**隐藏时改用更慢的退避，而非暂停。** 循环仍按定时器重试，后台标签页依旧支付后台流量与 CPU，且任何上限都难免武断。暂停能把隐藏标签页的重连尝试降到零，这才是收益所在。

**连首次尝试也暂停。** 后台恢复或打开的标签页在获得焦点前一直不连接。启动序列本就能容忍未连接状态，单次初始尝试是最廉价的探测；首次尝试始终执行保留了这一点。

**增加 `pauseWhileHidden` 配置开关。** 目前没有消费方需要该逃生口，且暂停是电量／延迟不变量，而非随部署变化的可调项。等出现真实消费方时再加该开关。

**只中止退避超时、不加 epoch。** 中止 sleep 解决了及时关闭，但没有解决旧循环竞态：被中止唤醒的循环可能在重启后再次进入运行检查并翻倍。epoch 守卫从构造上关掉了这个窗口。

## Consequences

隐藏标签页在隐藏期间零重连尝试；标签页重新可见时立即重连，用户看到的 `reconnecting` 状态不会长于当前握手。`stop()` 现在能从任何循环状态及时收敛，重启也不可能与第二个 generation 竞态。controller 的公开接口不变：epoch 与可见性等待均为实例私有，两个新 helper 是模块局部的。

## Verification

`connection.client.spec.ts` 固定隐藏暂停（跨越多个退避窗口不重试、重新可见立即重试）、隐藏暂停期间 stop（stop 加可见后不再重试），以及退避期间重启的风险场景（废弃的退避窗口过后仍只有一个活跃 generation）。既有重连、状态去重与 sink 异常隔离用例原样通过。

## Related

[WebSocket downlink carrier](2026-08-04-websocket-downlink-carrier.md) 拥有双 socket 物理布局，其 generation 失败会进入这个循环；断线后重连并重建的 resync 策略是 [gui layering and RPC protocol](2026-07-19-gui-layering-and-rpc-protocol.md) 的决策。
