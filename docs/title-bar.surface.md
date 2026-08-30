# title-bar.surface

Realm-local title-bar chrome for secondary editor surfaces.

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| Version     | `1.0.0`                                                            |
| Provided by | `provideSurfaceTitleBar()` returning the surface title-bar factory |
| Consumed by | Core detached-window integration                                   |
| Owner       | `title-bar` (bundled)                                              |

## Contract

```ts
type SurfaceTitleBarFactory = {
  create(options: {
    document: Document;
    controller: SurfaceWindowController;
    title?: string;
    actions?: SurfaceTitleBarAction[];
    onDidActivateAppIcon?: () => void | Promise<void>;
  }): SurfaceTitleBarHandle;
};

type SurfaceTitleBarHandle = {
  element: HTMLElement;
  setTitle(title: string): void;
  destroy(): void;
};

type SurfaceTitleBarAction = {
  id: string;
  label: string;
  iconName?: string;
  priority?: number;
  onDidActivate(): void | Promise<void>;
};

type SurfaceWindowController = {
  getState(): SurfaceWindowState | Promise<SurfaceWindowState>;
  onDidChangeState?(callback: (state?: SurfaceWindowState) => void): Disposable;
  onDidFocus?(callback: () => void): Disposable;
  onDidBlur?(callback: () => void): Disposable;
  focus?(): void | Promise<void>;
  minimize?(): void | Promise<void>;
  maximize?(): void | Promise<void>;
  unmaximize?(): void | Promise<void>;
  close?(): void | Promise<void>;
  requestClose?(): void | Promise<void>;
  setBounds?(bounds: { x: number; y: number; width: number; height: number }): void | Promise<void>;
  getDoubleClickAction?():
    "Maximize" | "Minimize" | "None" | Promise<"Maximize" | "Minimize" | "None">;
};

type SurfaceWindowState = {
  maximized?: boolean;
  fullscreen?: boolean;
  fullScreen?: boolean;
  visible?: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
};
```

`document` selects the DOM realm for every node, event listener, observer and window-state subscription owned by the instance. The returned root contains the common logo, title, control-tile host and window controls, but never creates an application menu, submenu portal, menu updater or context-menu interceptor.

Each action is rendered as a realm-local `<title-bar-tile>` with button semantics, an accessible name, `tabIndex=0`, click activation and Enter/Space keyboard activation. Its `priority` follows the existing `title-bar` control-tile ordering.

When `title-bar.customMenus` is enabled, the package also renders context menus for secondary surfaces in the right-clicked target's own `Document`. Disabling it restores native Electron context menus in every surface as well as native application-menu popups in the primary window. This remains independent of `core.titleBar`: the primary chrome and the package-wide context-menu renderer have separate lifecycles.

`requestClose` is preferred over `close` so a detached window can perform its renderer-confirmed close handshake. The maximize button and an unclaimed title-bar double-click use the same controller; on macOS `getDoubleClickAction` may select maximize, minimize or no action. Calling `destroy()` more than once is safe and removes all actions, controller subscriptions and DOM owned by the handle. Destroying the factory destroys every outstanding handle, and a later handle teardown remains safe.

The factory exists even when `core.titleBar` is `native`; that setting controls only the primary workspace bar.
