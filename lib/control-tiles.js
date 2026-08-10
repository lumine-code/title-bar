// The class the bar stamps on every element it hosts. It is what marks a tile
// as a tile: `.inline-block` is a layout utility packages also use *inside* a
// tile, so it cannot say where one starts, and a theme keying on it paints a
// nested block as though it were a second tile. Stamped on insertion, removed
// on destroy so an element handed back to a package leaves as it arrived.
const TILE_CLASS = "title-bar-item";

class Tile {
  constructor(item, priority, tiles) {
    this.item = item;
    this.priority = priority;
    this.tiles = tiles;
  }

  getPriority() {
    return this.priority;
  }

  getItem() {
    return this.item;
  }

  destroy() {
    this.tiles.splice(this.tiles.indexOf(this), 1);
    this.item.classList.remove(TILE_CLASS);
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
    item.classList.add(TILE_CLASS);
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

module.exports = { ControlTiles, Tile, TILE_CLASS };
