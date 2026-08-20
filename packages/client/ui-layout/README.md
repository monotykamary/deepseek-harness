# @monotykamary/dsh-client-ui-layout

English | [中文](README.zh.md)

Shell plugin: three-column AppFrame with a resizable center/bottom split plus the `ctx.layout` panel-geometry service; it registers into the runtime-owned `root` slot and declares `sidebar`, `conversation`, `bottom-panel`, `details`, and `shell.overlay`. Both column boundaries expose the same subtle drag affordance as the bottom split: an 8px hit strip with a 2x32 hairline bar at vertical center that fades in on hover of the owning column, the strip itself, or a drag; only Details shrinks during concession. Double-clicking the sidebar, Details, or bottom-panel resize boundary restores that open panel's declared default width or height. A closed sidebar retains a 56px control rail; an explicitly open Details preference that cannot preserve the center floor receives `sheet` hosting instead of disappearing at its derived zero inline width. Below 1024px, AppFrame auto-collapses an open sidebar; the 768–1023px tablet range keeps the rail and its re-open action, while widths below 768px replace the rail with a portaled drawer and a borderless 32px panel action aligned to the conversation title row. The drawer gives the conversation the complete frame width and opens the same expanded sidebar tree. The package also seats the theme presenter: it consumes resolved `ctx.theme` snapshots and projects them onto the document (`html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background). Measuring after palette and token application keeps the rendered background as the single color authority; disposing the presenter removes its metadata node with its other global writes.

AppFrame always mounts the conversation, zero-height bottom host, and details column; a connected Session renders through `SessionProvider`. The transient layout store starts the sidebar at its default width with details and bottom panels closed, and it never reads or writes `localStorage`. The bottom panel first opens at 280px, drags between 160px and 520px, restores its last dragged height after close/reopen, and concedes enough height to retain a 240px conversation floor. Any current Session owns the details region — a blank New Session page included, so its workbench stays reachable before the first message — while the no-session empty state derives a zero rendered details width without changing that stored preference. Selecting a different Session (blank sessions included) closes details before paint; returning to the same Session restores its unchanged width. The conversation owner share carries whether Details is requested open, the sidebar owner share carries its column/drawer geometry, the bottom owner share carries its conceded height and close callback, and the Details owner share carries `column | sheet` plus the layout-owned close callback for the shipped [`ui-workbench`](../ui-workbench/README.md) occupant; registrants obtain business data from standard hooks and actions from their own inject faces.

The `/client` exports are the plugin body (`apply`/`inject`), `LayoutController`, and the five owner-share interfaces. AppFrame, the panel store, and the concession solver remain package-internal.

## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Panel geometry is transient** — reload restores the sidebar default with details and bottom panels closed; switching between distinct Session ids also closes details and forgets its dragged width, while unselected surfaces render details at zero width without modifying geometry.
- **Concession derives zero inline width without touching the preference** — an open occupant receives `sheet` while constrained and returns to its preferred inline width when the window widens; consumers must not read the stored Details width as the rendered host mode.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.
