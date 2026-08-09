class ContextMenuInterceptor {
  constructor(configState) {
    this.configState = configState;
    this.originalShowForEvent = null;
    this.contextMenu = null;
    this.active = false;
  }

  activate() {
    if (this.active) return;

    // Save original method
    this.originalShowForEvent = lumine.contextMenu.showForEvent.bind(lumine.contextMenu);

    // Override showForEvent
    lumine.contextMenu.showForEvent = (event) => {
      if (this.configState.customContextMenus) {
        this.showCustomContextMenu(event);
      } else {
        this.originalShowForEvent(event);
      }
    };

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
        targetElement: targetElement,
        configState: this.configState,
      });
    }
  }

  deactivate() {
    if (!this.active) return;

    // Restore original method
    if (this.originalShowForEvent) {
      lumine.contextMenu.showForEvent = this.originalShowForEvent;
      this.originalShowForEvent = null;
    }

    // Clean up any open menu
    this.contextMenu?.destroy();
    this.contextMenu = null;

    this.active = false;
  }

  isActive() {
    return this.active;
  }
}

module.exports = { ContextMenuInterceptor };
