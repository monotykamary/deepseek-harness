# Agent Note: Admission resampling of oversized images

Status: implemented

[English](2026-08-21-image-dimension-admission-resampling.md) | 中文

## Problem

图片准入会拒绝任何单边超过 `maxImageDimension`（默认 2000px）或解码像素超过 `maxImagePixels`（默认 40M）的光栅图片：拒绝是为了让被提供方拒绝的图片不进入持久历史，模型或用户必须自行缩小后重试。实际上，每次超限的 `read_image` 和每次超限的上传都会变成可恢复错误，而 pi 编码智能体会在把图片发送给模型之前先缩小它——本决策就是要与这一行为对齐。

## Decision

`LocalAttachmentStore` 不再拒绝，而是把已接纳图片重采样到所配置的上限以内。`fitImageToLimits`（attachment-local `src/image.ts`）完整解码光栅，当任一上限被超过时按统一缩放比例调整尺寸（当某一侧已到最小值时，取像素上限的精确余量），并以原格式重新编码——PNG 无损，JPEG/WebP 质量 90，动态 GIF 通过 sharp 的 `animated` 输入保留每一帧——保存路径提交这些字节。引用、`read_image` 信封和附件 RPC 都准确描述已存储的光栅。`validateImageFile` 仍然证明输入可以完整解码且声明的格式真实；尺寸和像素上限不再是准入失败。所有经由附件能力缝提交的来源（宿主上传、MCP 工具图片、ACP 内容、`read_image`）行为一致，因此持久历史永远不会携带被已部署模型路由拒绝的光栅。`IMAGE_DIMENSION_TOO_LARGE` 与 `IMAGE_TOO_MANY_PIXELS` 对其他存储实现仍是 wire 错误码；字节上限仍然拒绝而非重采样。

## Alternatives considered

- **保留拒绝并要求手动缩小。** 即此前的决策（[已归档](../../archived/bug-fix/2026-08-17-image-dimension-admission-limit.md)）：每次超限图片都会变成可恢复工具错误或被拒绝的上传，并且模型自行协调缩小，无法保证结果仍在上限以内。
- **在提供方适配器按请求缩小。** 为时已晚：到请求组装时图片已经是持久历史，每条路由和每次重试都会再次失败；还会在每次请求上重复解码与缩放，并让信封报告的尺寸与模型实际收到的内容不一致。
- **配置开关控制缩小。** 开关的默认值要么保留本变更要消除的拒绝行为，要么隐藏与 pi 等价的行为；上限本身已经是质量与兼容性之间的部署旋钮。

## Consequences

- 超限图片以重采样后的形态进入持久历史并随之后每次请求发送，提供方侧的尺寸拒绝无法再毒化会话。
- 触发重采样时，已存储的光栅与调用方提供的字节不同；引用与信封始终报告已存储光栅的真实尺寸，模型可见的元数据保持诚实。
- JPEG/WebP 以质量 90 有损重编码；需要原始细节的部署应调高上限。
- 单图字节上限仍然拒绝，摄入带宽保持有界。
- 本变更之前已经接纳了超限图片的会话仍然不可用；重采样不会修复既有历史。

## Testing

attachment-local `image.spec.ts` 固定重采样的计算（在上限内字节不变、按单边缩小、像素上限余量、格式保持、动态 GIF 帧数），`store.spec.ts` 固定提交后的重采样对象及其读回，tool-fs `read-image.spec.ts` 固定缩小后的工具结果与信封，`read-image-downscale` 快照场景通过组装后的应用回放重采样后的 2000x1 光栅。

## Related

- [已归档：图片单边尺寸准入上限](../../archived/bug-fix/2026-08-17-image-dimension-admission-limit.md) —— 本决策取代的拒绝决策。
- [最小 read_image 工具](../feature/2026-08-10-minimal-read-image-tool.md) —— 准入策略被本变更修改的工具。
- [Web 图片摄入与上限对齐](../feature/2026-08-12-web-image-intake-and-limits-alignment.md) —— 同一 `ImageAttachmentLimits` 在输入框侧的呈现。
