# @monotykamary/dsh-client-ui-layout

English | [中文](README.zh.md)

Shell plugin: three-column AppFrame (drag handles and concession chain) plus the `ctx.layout` panel-geometry service; it registers into the runtime-owned `root` slot and declares `sidebar`, `conversation`, `details`, and `conversation.empty`. The sidebar resize boundary is an invisible hit strip, while the Details boundary retains its floating pill; only Details shrinks during concession. A closed sidebar retains a 56px control rail; an explicitly open Details preference that cannot preserve the center floor receives `sheet` hosting instead of disappearing at its derived zero inline width. Below 1024px, AppFrame auto-collapses an open sidebar; the 768–1023px tablet range keeps the rail and its re-open action, while widths below 768px replace the rail with a portaled drawer and a borderless 32px panel action aligned to the conversation title row. The drawer gives the conversation the complete frame width and opens the same expanded sidebar tree. The package also seats the theme presenter: it consumes resolved `ctx.theme` snapshots and projects them onto the document (`html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background). Measuring after palette and token application keeps the rendered background as the single color authority; disposing the presenter removes its metadata node with its other global writes.

AppFrame always mounts the conversation and details columns; a connected Session renders through `SessionProvider`. The transient layout store starts the sidebar at its default width and details closed, and it never reads or writes `localStorage`. Hero and other unselected states also derive a zero rendered details width without changing that stored preference. AppFrame retains the last non-blank Session id across those states: the first Session remains closed, an explicit details action opens the contract default width, returning to the same Session restores its unchanged width, and selecting a different Session closes details before paint. The conversation owner share is empty, the sidebar owner share carries its column/drawer geometry, and the Details owner share carries `column | sheet` plus the layout-owned close callback for the shipped [`ui-workbench`](../ui-workbench/README.md) occupant; registrants obtain business data from standard hooks and actions from their own inject faces.

The `/client` exports are the plugin body (`apply`/`inject`), `LayoutController`, and the four owner-share interfaces. AppFrame, the panel store, and the concession solver remain package-internal.

## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Panel geometry is transient** — reload restores the sidebar default and details closed; switching between distinct Session ids also closes details and forgets its dragged width, while unselected surfaces render details at zero width without modifying geometry.
- **Concession derives zero inline width without touching the preference** — an open occupant receives `sheet` while constrained and returns to its preferred inline width when the window widens; consumers must not read the stored Details width as the rendered host mode.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.
