# title-bar

The title bar's control tile collection: a package inserts an element beside the window buttons and receives a handle that removes it.

|             |                                                           |
| ----------- | --------------------------------------------------------- |
| Version     | `1.0.0`                                                   |
| Provided by | `provideTitleBar()` returning the control tile collection |
| Consumed by | `consumeTitleBar(titleBar)`                               |
| Owner       | `title-bar` (bundled)                                     |

The same shape as `status-bar`, for the strip at the top of the window rather than the bottom. Reserve it for controls that act on the window itself — layout, presentation, window state — rather than on the file being edited.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "title-bar": {
      "versions": { "^1.0.0": "consumeTitleBar" }
    }
  }
}
```

## Contract

```ts
type TitleBar = {
  addItem(options: { item: HTMLElement; priority?: number }): Tile;
  getTiles(): Tile[];
};

type Tile = {
  getItem(): HTMLElement;
  getPriority(): number;
  destroy(): void;
};
```

| Option     | Description                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `item`     | Required, and an `HTMLElement` — unlike the status bar, this is inserted into the DOM directly rather than through a view registry. |
| `priority` | Defaults to `0`. Lower sits closer to the outer edge; equal priorities fall back to insertion order.                                |

`getTiles()` returns a copy of the ordered list, so mutating it does nothing.

## Minimal example

```js
const { Disposable } = require("lumine");

module.exports = {
  consumeTitleBar(titleBar) {
    const tile = document.createElement("title-bar-tile");
    tile.classList.add("my-package-toggle");
    tile.appendChild(icon("versions"));
    tile.addEventListener("click", () => this.toggleLayout());

    const handle = titleBar.addItem({ item: tile, priority: 10 });
    return new Disposable(() => handle.destroy());
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

**The bar stamps `.title-bar-item` on what it hosts** and removes it again on destroy. That is what a theme keys its size, rounding and hover feedback on, so your tile needs no styling of its own to sit alongside the window controls. Never write that class yourself, and never use `.inline-block` to stand in for it — that is a layout utility, useful _inside_ a tile, saying nothing about where one starts.

Related controls that travel together go in a `<title-bar-tile-group>`, handed to `addItem` in place of a tile. The group is a layout box and never a tile itself: the bar marks its `<title-bar-tile>` children instead, so a theme paints one rectangle per control rather than one across the group.

The strip is a drag region, and the bar exempts every tile from that automatically. It also sits a few pixels below the window top and reaches back up into that inset, so a tile drawn full height lines up with the application menu and the window buttons — see `--title-bar-item-bleed` in the package's stylesheet if your theme insets tiles instead.

## Behavior

The service is `undefined` when the title bar is not rendered. With `core.titleBar` set to `native` the operating system draws the bar and this package draws nothing, so `provideTitleBar` resolves through an optional chain and yields nothing. **Guard your consumer**: it may be handed `undefined` rather than never being called.

Tiles are inserted in priority order at the moment they are added, so a later tile still lands in the right place.

There are few consumers, so no priority band scheme has been established. Keep numbers small and leave gaps.

## Teardown

Keep the returned tile and `destroy()` it. As with the status bar, removing only the element leaves the tile in the ordered collection and the next insertion positioned against a detached node.

Destroying the title bar destroys every tile it holds, so a tile disposed after that is disposed twice. That is expected and the second call does nothing — your teardown does not have to guard against it.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
