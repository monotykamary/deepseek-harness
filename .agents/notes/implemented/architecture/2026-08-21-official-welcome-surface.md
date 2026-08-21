# Official welcome surface

English | [中文](2026-08-21-official-welcome-surface.zh.md)


## Decision

The resident conversation Hero declares `conversation.hero.welcome` as a root-scoped single slot and passes one owner fact: whether the Hero is the true no-session landing state. The official brand plugin occupies that slot alongside its existing brand marks and renders nothing for a connected blank Session.

The welcome content remains separate from Workspace selection and the composer. It describes the assembled product's T3-inspired navigation, terminal and file workbench, Fovea code intelligence, and Fabric execution without introducing duplicate actions. Feature styling consumes the existing semantic aliases from `ui-theme`; the contribution adds no global styles or literal palette.

## Consequences

Alternative distributions may leave the seat empty or provide their own welcome occupant. The conversation package owns only placement and landing state, while official product copy, attribution, and presentation remain in `ui-brand-official`. The welcome occupant follows its declaration in every build profile. The three official marks remain a profile-gated transactional set, so HMR cannot leave a partial official mark combination.
