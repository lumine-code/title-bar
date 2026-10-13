# title-bar

Window-local controls with one workspace registration and a separate DOM instance per editor window.

|             |                             |
| ----------- | --------------------------- |
| Version     | `2.0.0`                     |
| Provided by | `provideTitleBar()`         |
| Consumed by | `consumeTitleBar(titleBar)` |
| Owner       | `title-bar`                 |

## Registration

Declare `"title-bar": { "versions": { "^2.0.0": "consumeTitleBar" } }` in `consumedServices`.

## Contract

```ts
type WindowContext = {
  window: EditorWindow;
  document: Document;
  workspace: Workspace;
  editorContainer: PaneContainer;
};
type Tile = { getItem(): HTMLElement; getPriority(): number; destroy(): void };
type ScopedTitleBar = {
  addItem(options: { item: HTMLElement; priority?: number }): Tile;
  getTiles(): Tile[];
};
type TitleBar = {
  addItem(options: {
    create(context: WindowContext): { element: HTMLElement; dispose(): void };
    windows?: "main" | "all";
    priority?: number;
  }): Disposable;
  observeWindows(
    create: (bar: ScopedTitleBar, context: WindowContext) => Disposable,
    options?: { windows?: "main" | "all" },
  ): Disposable;
  forWindow(window: EditorWindow): ScopedTitleBar;
  getTiles(window?: EditorWindow): Tile[];
};
```

`create` is required. `windows` defaults to `"main"`; `"all"` includes current and future windows. Each factory owns a distinct element and subscriptions. Target native operations through `context.window`, and use `context.editorContainer` for the local editing context. Priority defaults to zero; lower priorities sit closer to the outer edge.

`observeWindows` owns a controller that manages multiple or dynamic local tiles. Its callback returns a disposable owning those tiles and subscriptions. `forWindow` is useful for clients that already own a specific window's lifecycle. Queries default to the main window and return a copy of its ordered collection.

## Minimal example

```js
module.exports = {
  consumeTitleBar(titleBar) {
    return titleBar.addItem({
      windows: "all",
      priority: 10,
      create({ document, window }) {
        const element = document.createElement("title-bar-tile");
        element.textContent = "□";
        const click = () => window.maximize();
        element.addEventListener("click", click);
        return {
          element,
          dispose: () => element.removeEventListener("click", click),
        };
      },
    });
  },
};
```

## Anatomy of a tile

The same shape as a status-bar tile, for the strip at the top of the window. Following it is not enforced — the bar hosts whatever you hand it — but a tile that departs from it is the one that looks wrong under somebody else's theme.

```html
<title-bar-tile class="my-package-toggle">
  <span class="icon icon-versions"></span>
</title-bar-tile>
```

**The root is `<title-bar-tile>`.** A plain custom element, deliberately not a `<button>`: it drags in no widget padding, line height, cursor or focus ring for the bar to strip back out. Your own class goes on it and is what your stylesheet targets.

**One tile is one control**, and the click binds to the tile itself. **A control tile is a glyph, not a label** — reserve it for controls that act on the window: layout, presentation, window state.

Every interactive tile supplies a context menu containing all its actions, including the primary left click and any middle click or modifier shortcuts. Right click only opens that menu. Set `data-context-menu-boundary` on a tile that owns its menu, register its commands on the workspace, and resolve the invoking window from the command context. Add `mouseBindingLabel` to each menu item with a mouse shortcut; the menu also keeps the command's keyboard hint. Tooltips use plain text describing the current state and primary left-click action, without gesture lists or command hints. Dispose menu registrations with the tile's window contribution.

**The bar stamps `.title-bar-item` on what it hosts** and removes it again on destroy. That is what a theme keys its size, rounding and hover feedback on, so your tile needs no styling of its own to sit alongside the window controls. Never write that class yourself, and never use `.inline-block` to stand in for it — that is a layout utility, useful _inside_ a tile, saying nothing about where one starts.

Related controls that travel together go in a `<title-bar-tile-group>`, handed to `addItem` in place of a tile. The group is a layout box and never a tile itself: the bar marks its `<title-bar-tile>` children instead, so a theme paints one rectangle per control rather than one across the group.

The strip is a drag region, and the bar exempts every tile from that automatically. It also sits a few pixels below the window top and extends every tile's hit target back through that inset, so full-height controls and visually inset pills alike remain clickable at the screen edge; `--title-bar-item-bleed` controls only whether the visible tile follows that hit target or stays inside the bar.

## Behavior

The package owns the window chrome on every platform. On Windows and Linux it also hosts core's HTML application menu; macOS keeps its Application Menu in the system menu bar. This platform difference does not change the control-tile service.

Tiles are inserted in priority order at the moment they are added, so a later tile still lands in the right place.

There are few consumers, so no priority band scheme has been established. Keep numbers small and leave gaps.

Clicking the Lumine logo in an additional editor window invokes `workspace.attachWindow(window)` and reattaches its complete split layout to the main window. The logo also supports Enter and Space. In the main window, it opens About.

## Teardown

Dispose the workspace registration to release all instances and prevent future creation. Scoped controllers keep their returned tiles and call `destroy()` on them. As with the status bar, removing only the element leaves the tile in the ordered collection and the next insertion positioned against a detached node.

Destroying the title bar destroys every tile it holds, so a tile disposed after that is disposed twice. That is expected and the second call does nothing — your teardown does not have to guard against it.

## Versioning

`2.0.0` replaces direct global insertion with window factories. Consumers request `^2.0.0`; the provider and consumers move together.
