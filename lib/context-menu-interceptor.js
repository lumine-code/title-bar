// Replaces Electron's native context menu with the styled HTML one by standing
// in front of both ContextMenuManager entry points. The primary document calls
// `showForEvent`; secondary surfaces call `showForSurfaceEvent` so their native
// fallback opens in the right BrowserWindow. Core resolves both through the
// manager on every right-click, so own properties are enough to intercept them.
class ContextMenuInterceptor {
  constructor() {
    this.contextMenu = null;
    this.active = false;
  }

  activate() {
    if (this.active) return;

    // `delete` is what puts a prototype method back. Assigning it would leave
    // an own property shadowing the prototype for good. The own-property flags
    // cover the case where another integration got there first.
    this.hadOwnShowForEvent = Object.hasOwn(lumine.contextMenu, "showForEvent");
    this.originalShowForEvent = lumine.contextMenu.showForEvent;
    this.hadOwnShowForSurfaceEvent = Object.hasOwn(lumine.contextMenu, "showForSurfaceEvent");
    this.originalShowForSurfaceEvent = lumine.contextMenu.showForSurfaceEvent;

    const originalShowForEvent = this.originalShowForEvent;
    const originalShowForSurfaceEvent = this.originalShowForSurfaceEvent;
    this.showForEventWrapper = (...args) => {
      if (!this.active) return originalShowForEvent?.apply(lumine.contextMenu, args);
      return this.showCustomContextMenu(args[0]);
    };
    this.showForSurfaceEventWrapper = (...args) => {
      if (!this.active) return originalShowForSurfaceEvent?.apply(lumine.contextMenu, args);
      return this.showCustomContextMenu(args[0]);
    };
    lumine.contextMenu.showForEvent = this.showForEventWrapper;
    lumine.contextMenu.showForSurfaceEvent = this.showForSurfaceEventWrapper;

    this.active = true;
  }

  showCustomContextMenu(event) {
    // Close any existing menu
    this.contextMenu?.destroy();

    // Store target element
    const targetElement = event.target;

    // Get menu template using original ContextMenuManager logic
    const menuTemplate = lumine.contextMenu.templateForEvent(event);

    if (menuTemplate && menuTemplate.length > 0) {
      const { ContextMenu } = require("./context-menu.js");

      // Create custom HTML menu
      this.contextMenu = ContextMenu.createContextMenu(menuTemplate, {
        x: event.clientX,
        y: event.clientY,
        targetElement,
      });
    }
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;

    if (lumine.contextMenu.showForEvent === this.showForEventWrapper) {
      if (this.hadOwnShowForEvent) {
        lumine.contextMenu.showForEvent = this.originalShowForEvent;
      } else {
        delete lumine.contextMenu.showForEvent;
      }
    }
    if (lumine.contextMenu.showForSurfaceEvent === this.showForSurfaceEventWrapper) {
      if (this.hadOwnShowForSurfaceEvent) {
        lumine.contextMenu.showForSurfaceEvent = this.originalShowForSurfaceEvent;
      } else {
        delete lumine.contextMenu.showForSurfaceEvent;
      }
    }
    this.originalShowForEvent = undefined;
    this.originalShowForSurfaceEvent = undefined;
    this.showForEventWrapper = undefined;
    this.showForSurfaceEventWrapper = undefined;

    this.contextMenu?.destroy();
    this.contextMenu = null;
  }

  isActive() {
    return this.active;
  }
}

module.exports = { ContextMenuInterceptor };
