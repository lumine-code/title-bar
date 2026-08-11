// Replaces Electron's native context menu with the styled HTML one, by
// standing in front of `lumine.contextMenu.showForEvent`. Core calls that
// through the manager on every right-click rather than holding a reference, so
// an own property on the instance is enough to intercept it.
class ContextMenuInterceptor {
  constructor(configState) {
    this.configState = configState;
    this.contextMenu = null;
    this.active = false;
  }

  activate() {
    if (this.active) return;

    // `delete` is what puts the manager back, not assignment: the original is
    // a prototype method, and writing it onto the instance would leave an own
    // property shadowing it for good. `hadOwnProperty` covers the case where
    // something else got there first.
    this.hadOwnShowForEvent = Object.hasOwn(lumine.contextMenu, "showForEvent");
    this.originalShowForEvent = lumine.contextMenu.showForEvent;

    lumine.contextMenu.showForEvent = (event) => this.showCustomContextMenu(event);

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

    if (this.hadOwnShowForEvent) {
      lumine.contextMenu.showForEvent = this.originalShowForEvent;
    } else {
      delete lumine.contextMenu.showForEvent;
    }
    this.originalShowForEvent = null;

    this.contextMenu?.destroy();
    this.contextMenu = null;

    this.active = false;
  }

  isActive() {
    return this.active;
  }
}

module.exports = { ContextMenuInterceptor };
