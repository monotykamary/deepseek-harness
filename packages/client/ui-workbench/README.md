# @monotykamary/dsh-client-ui-workbench

English | [中文](README.zh.md)

Tabbed right-panel host for independently registered Session surfaces. The plugin occupies layout's `details` slot, declares the additive `workbench.surface` list, and provides `ctx.workbench.open(id)`. A surface registration supplies its stable `id`, order, locale-following label, component, and any child slots or store it owns; opening an unregistered branded `WorkbenchSurfaceId` fails loud. Removing a surface registration removes its tab through the same declaration lifetime.

Open and active tab ids live in a transient per-session entry store. Opening a surface appends it once and activates it; closing the active tab selects its adjacent survivor, while closing the panel retains the complete tab set. The launcher lists registered surfaces that are not open. Pointer selection and Left/Right/Home/End keyboard navigation use the same activation action.

Layout supplies the Details hosting mode. When the three-column concession solver can preserve the center floor, Workbench fills the resizable inline column. When an explicitly open Details preference resolves to zero inline width, the same mounted workbench portals through the shared right `Sheet`; closing either host writes the one layout close action. Switching Sessions still closes Details before paint, while each resident Session store retains its own tabs.

The shipped Web composition registers **Inspect** from [`ui-conversation`](../ui-conversation/README.md) and **Changes** from [`ui-deliverables`](../ui-deliverables/README.md); the [workbench Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-web-ui-workbench.md) owns the package split and deferred capability boundaries. Inspect shares the conversation store, so a Tool row selects a call before opening the tab; Changes reads its own incremental Conversation target. The 40px tab bar, compact active/hover hierarchy, launcher, and responsive Sheet behavior adapt [T3 Code](https://github.com/pingdotgg/t3code) revision `a4cc1367b03ee0c1dc2b50fceac81ef5e63212e2`; [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md) retains the complete MIT text.

The `/client` entrypoint exports the plugin body, `IWorkbench`, and the branded surface and registration types. Components, store factory, directory projection, and controller implementation remain package-internal.

## Model Experience

None, as the workbench manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Tabs are transient and fixed in opening order** — reload discards every tab, Session switching hides the panel, and tabs cannot be reordered.
- **The shell supplies no filesystem, terminal, browser, or Git data** — those capabilities require independently registered surfaces and their own Host contracts; the shipped Changes tab is loaded Session mutation history rather than a repository diff.
