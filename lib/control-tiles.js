// The class the bar stamps on every element it hosts. It is what marks a tile
// as a tile: `.inline-block` is a layout utility packages also use *inside* a
// tile, so it cannot say where one starts, and a theme keying on it paints a
// nested block as though it were a second tile. Stamped on insertion, removed
// on destroy so an element handed back to a package leaves as it arrived.
const TILE_CLASS = "title-bar-item";

// The tile primitive, and the layout box that holds several of them. A group is
// never itself a tile: its `<title-bar-tile>` children are, so a theme paints
// one rectangle per control instead of one across the group and a second inside
// it. See `docs/title-bar.md`.
const TILE_TAG = "title-bar-tile";
const GROUP_TAG = "title-bar-tile-group";

function isGroup(element) {
  return element.tagName?.toLowerCase() === GROUP_TAG;
}

// Marks what the bar hosts, and takes the mark off again. A group is watched
// rather than read once: a package rendering its children through React or etch
// hands the bar an empty box and fills it on a later frame.
class Stamp {
  constructor(element) {
    this.element = element;
    this.observer = null;

    if (!isGroup(element)) {
      element.classList.add(TILE_CLASS);
      return;
    }

    this.mark();
    this.observer = new MutationObserver(() => this.mark());
    this.observer.observe(element, { childList: true, subtree: true });
  }

  mark() {
    for (const tile of this.element.querySelectorAll(TILE_TAG)) {
      tile.classList.add(TILE_CLASS);
    }
  }

  dispose() {
    if (!this.observer) {
      this.element.classList.remove(TILE_CLASS);
      return;
    }
    this.observer.disconnect();
    this.observer = null;
    for (const tile of this.element.querySelectorAll(TILE_TAG)) {
      tile.classList.remove(TILE_CLASS);
    }
  }
}

class Tile {
  constructor(item, priority, tiles) {
    this.item = item;
    this.priority = priority;
    this.tiles = tiles;
    this.stamp = null;
  }

  getPriority() {
    return this.priority;
  }

  getItem() {
    return this.item;
  }

  destroy() {
    this.tiles.splice(this.tiles.indexOf(this), 1);
    this.stamp?.dispose();
    this.stamp = null;
    this.item.remove();
  }
}

class ControlTiles {
  constructor(element) {
    this.element = element;
    this.tiles = [];
  }

  addItem(options) {
    const { item, priority = 0 } = options;
    const tile = new Tile(item, priority, this.tiles);

    // Find insertion index
    let index = 0;
    let nextElement = null;
    for (; index < this.tiles.length; index++) {
      if (this.tiles[index].priority > priority) {
        nextElement = this.tiles[index].item;
        break;
      }
    }

    this.tiles.splice(index, 0, tile);
    tile.stamp = new Stamp(item);
    this.element.insertBefore(item, nextElement);
    return tile;
  }

  getTiles() {
    return this.tiles.slice();
  }

  destroy() {
    while (this.tiles.length > 0) {
      this.tiles[0].destroy();
    }
  }
}

module.exports = { ControlTiles, Tile, Stamp, TILE_CLASS, TILE_TAG, GROUP_TAG };
