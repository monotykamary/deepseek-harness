/**
 * Layout plugin, browser half: one register() call contributes AppFrame into
 * the runtime's built-in 'root' slot and, in the same breath, declares the
 * six child slots (declaration = exclusive render authority), seats the
 * layout store (panel geometry), and wires the panel-action service face.
 * ctx.layout is the cross-plugin panel-action contract; navigation state lives
 * with the runtime sessions service. A second effect seats the theme
 * presenter, which projects ctx.theme snapshots onto document.body.
 */
import type { ClientContext } from '@monotykamary/dsh-client-runtime/client'
import type {} from '@monotykamary/dsh-client-ui-theme/client'
import type { PanelActions } from './service.ts'
import { AppFrame } from './AppFrame.tsx'
import { createLayoutStore } from './stores.ts'
import { LayoutController } from './service.ts'
import { ThemePresenter } from './theme-presenter.ts'

// Contract exports only (export-convergence rule: cross-package consumers
// keep a symbol exported; test-only/package-internal symbols live off /src).
// ILayout: the ctx.layout face consumers and test fakes type against.
// OwnerShare contracts below are the render-side halves registrants compose
// against; the frame components and the store factory are package-internal.
export { LayoutController } from './service.ts'
export type { ILayout } from './service.ts'

declare module '@monotykamary/cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside this plugin. */
    layout: import('./service.ts').ILayout
  }
}

declare module '@monotykamary/dsh-client-ui-slots' {
  interface SlotMap {
    // The 'root' entry itself is the runtime's built-in slot (declared
    // there); these five are the frame's children, declared by the same
    // register() call that contributes AppFrame. Session owners never pass
    // sessionId: the framework injects it as a standard prop.
    /**
     * The whole left column. OCCUPIED by ui-sidebar's SidebarRoot, which
     * declares the workspace and settings seats inside it — registering here
     * replaces the navigation column outright rather than adding to it, and
     * the seats it declares disappear with it. To add something to the
     * sidebar, register into one of those inner seats instead.
     *
     * The occupant receives the frame's live column state (collapsed, width)
     * and is expected to render the compact control rail while collapsed.
     */
    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }
    /**
     * Root application takeover chain for the center column. The owner keeps
     * one selected id; the first matching contribution replaces the default
     * Conversation entry without taking over the sidebar or frame overlays.
     */
    'application.surface': { kind: 'chain'; scope: 'root'; owner: ApplicationSurfaceOwnerProps }
    /**
     * The whole center column, across both the no-session hero and a live
     * conversation. OCCUPIED by ui-conversation's ConversationRoot, which
     * declares the session body, composer, and input seats inside it —
     * registering here replaces the entire conversation surface (and removes
     * every seat it declares) rather than adding to it.
     *
     * Current-session-optional: the occupant owns both states without
     * changing its React identity, so it keeps its own state across a session
     * switch. The frame supplies whether the right details panel is open;
     * session facts arrive through the framework hooks of the `session-maybe` scope.
     */
    'conversation': { kind: 'single'; scope: 'session-maybe'; owner: ConvOwnerProps }
    /**
     * The resizable region below the conversation. Its single session-scoped
     * occupant stays mounted at zero height while closed, so a persistent
     * process attachment can continue without retaining vertical space.
     */
    'bottom-panel': { kind: 'single'; scope: 'session'; owner: BottomPanelOwnerProps }
    /**
     * The right details region, shown when the layout opens it. OCCUPIED by
     * ui-workbench, which declares its additive surface list; registering here
     * replaces the whole region and takes every surface registration with it.
     *
     * The owner reports whether the concession solver can host an inline
     * column. An open panel that cannot fit receives `sheet` and owns its
     * portaled presentation; `closePanel` always closes the layout preference.
     */
    'details': { kind: 'single'; scope: 'session'; owner: DetailsOwnerProps }
    /**
     * Frame-wide floating layer, above every column and outside their scroll
     * containers. Deliberately generic and unowned by any feature: a badge, a
     * toast stack or a status pill all belong here, and entries order among
     * themselves. The layer itself is click-through — entries opt back into
     * pointer events — so an occupant never blocks the app underneath.
     *
     * This is the additive seat for a frame-wide surface of your own: a fresh
     * `id` is added beside the shipped entries instead of replacing them.
     */
    'shell.overlay': { kind: 'list'; scope: 'root' }
  }
}

// OwnerShare contracts — the render-side share the slot owner supplies at
// renderSlot. Registrants IMPORT these and compose their full component props
// through the four-share intersection (PropsRuntime & PropsRenderSlots &
// PropsStore & I). Conversation business state and actions arrive through
// framework-standard hooks and each registrant's inject face, not owner props.

/** Merge-extensible ids for root application takeover entries. */
export interface ApplicationSurfaceMap {
  /** The shipped Session conversation. */
  conversation: never
}

/** Id of one application surface contributed through declaration merging. */
export type ApplicationSurfaceId = Extract<keyof ApplicationSurfaceMap, string>

/** Owner currency dispatched through the root application takeover chain. */
export interface ApplicationSurfaceOwnerProps {
  /** Currently selected application surface. */
  activeSurface: ApplicationSurfaceId
  /** Select another registered application surface. */
  openSurface: (id: ApplicationSurfaceId) => void
}

/** Sidebar owner share: application routing plus live column geometry. */
export interface SidebarOwnerProps {
  /** Currently selected root application surface. */
  applicationSurface: ApplicationSurfaceId
  /** Select another registered root application surface. */
  openApplicationSurface: (id: ApplicationSurfaceId) => void
  /** True when the sidebar is closed (the column renders the compact control rail). */
  collapsed: boolean
  /** Rendered column width in px (SIDEBAR_COLLAPSED when collapsed). */
  width: number
  /**
   * Present only when the frame hosts the column in the mobile drawer (AppFrame,
   * SIDEBAR_DRAWER_VIEWPORT): the slot's own collapse control then means
   * "dismiss the drawer" because rail/narrow store fields do not reach the
   * forced zero track. Absent in column mode, where collapse is rail flip.
   */
  drawerClose?: () => void
}

/** Conversation owner share: live frame state needed by center-column controls. */
export interface ConvOwnerProps {
  /** True while the right details panel is requested open, including sheet hosting. */
  detailsOpen: boolean
}

/** Bottom-panel owner share: rendered height and layout-owned close gesture. */
export interface BottomPanelOwnerProps {
  /** Current conceded height in px; zero means mounted but closed. */
  height: number
  /** Close the bottom-panel preference. */
  closePanel: () => void
}

/** Details owner share: hosting mode and layout-owned close gesture. */
export interface DetailsOwnerProps {
  /** Inline grid column when it fits; right Sheet when concession resolves zero width. */
  mode: 'column' | 'sheet'
  /** Close the Details preference from either host mode. */
  closePanel: () => void
}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'theme']

/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with the six child-slot declarations, the layout store seat,
 * and the inject hook that hands the store's bound actions to the service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const layout = new LayoutController()
  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'application.surface': { kind: 'chain', scope: 'root' },
        'conversation': { kind: 'single', scope: 'session-maybe' },
        'bottom-panel': { kind: 'single', scope: 'session' },
        'details': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
      // Exclusive store: the factory itself — the framework instantiates per
      // entry and delivers useStore/actions to AppFrame as standard props.
      store: createLayoutStore,
      // The hook's only side effect connects the root store to ctx.layout;
      // conversation business actions belong to their registrants.
      inject: (actions: PanelActions) => {
        layout.attachPanels(actions)
        return {}
      },
    }, AppFrame)
    return () => {
      disposeRegistration()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-layout: service + root registration')

  // Theme presentation: pure DOM writes from resolved snapshots — initial
  // state through the getter once, then event-driven only; no React path.
  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'ui-layout: theme presenter')
}
