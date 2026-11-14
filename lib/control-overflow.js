const INTERACTIVE = "button, input, select, textarea, a[href], [contenteditable], [tabindex]";
let nextViewportId = 0;

// The strip keeps its natural width, including while concealed. Only its
// viewport changes width, so measuring a collapsed strip never requires
// unhiding controls or cloning package-owned DOM.
class ControlOverflow {
  constructor({
    element,
    tilesElement,
    titleElement,
    windowButtonsElement,
    appIcon,
    menuElement,
    scheduleLayout,
  }) {
    this.element = element;
    this.tilesElement = tilesElement;
    this.titleElement = titleElement;
    this.windowButtonsElement = windowButtonsElement;
    this.appIcon = appIcon;
    this.menuElement = menuElement;
    this.scheduleLayout = scheduleLayout;
    this.document = element.ownerDocument;
    this.domWindow = this.document.defaultView;
    this.collapsed = false;
    this.expanded = false;
    this.destroyed = false;
    this.managedTiles = new Map();
    this.contextViews = globalThis.lumine?.menu?.ensureContextViewManager(this.document);

    this.slot = this.document.createElement("div");
    this.slot.className = "control-tiles-slot";
    this.viewport = this.document.createElement("div");
    this.viewport.className = "control-tiles-viewport";
    // The strip scrolls through wheel/keyboard input. Its animated clipping
    // width must never acquire the editor's automatic scrollbar chrome.
    this.viewport.dataset.scrollbar = "none";
    this.viewport.id = `title-bar-controls-${++nextViewportId}`;
    this.button = this.document.createElement("button");
    this.button.type = "button";
    this.button.className = "control-tiles-toggle";
    this.button.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="13" cy="8" r="1" fill="currentColor"/></svg>';
    this.button.setAttribute("aria-label", "Show title bar controls");
    this.button.setAttribute("aria-expanded", "false");
    this.button.setAttribute("aria-controls", this.viewport.id);
    this.button.hidden = true;
    tilesElement.before(this.slot);
    this.viewport.appendChild(tilesElement);
    this.slot.append(this.viewport, this.button);

    this.handleToggle = (event) => {
      if (this.expanded)
        this.close({
          restoreFocus:
            event.detail === 0 || this.tilesElement.contains(this.document.activeElement),
        });
      else this.open({ focus: event.detail === 0 });
    };
    this.handleToggleMouseDown = (event) => {
      if (event.button === 0) event.preventDefault();
    };
    this.handleOutside = (event) => {
      if (
        this.expanded &&
        !this.slot.contains(event.target) &&
        !this.contextViews?.containsOwnedElement(this.tilesElement, event.target)
      ) {
        this.close();
      }
    };
    this.handleKeyDown = (event) => {
      if (!this.expanded || event.defaultPrevented) return;
      if (event.key === "Escape") {
        // A menu or listbox opened by a tile owns its first Escape. It can be
        // body-mounted, and shares the editor's single context-view manager.
        if (this.contextViews?.getOwnedSurfaces(this.tilesElement).length) return;
        event.preventDefault();
        event.stopPropagation();
        this.close({ restoreFocus: true });
      } else if (
        event.target === this.button &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        this.focusFirstControl();
      }
    };
    this.handleTileKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat || (event.key !== "Enter" && event.key !== " "))
        return;
      const tile = event.target.closest?.("title-bar-tile");
      if (!this.managedTiles.has(tile) || event.target.closest(INTERACTIVE) !== tile) return;
      event.preventDefault();
      tile.click();
    };
    this.handleBlur = () => this.close();
    this.handleWheel = (event) => {
      if (
        event.defaultPrevented ||
        !this.expanded ||
        this.viewport.scrollWidth <= this.viewport.clientWidth
      )
        return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      this.viewport.scrollLeft += delta;
      event.preventDefault();
    };
    this.button.addEventListener("click", this.handleToggle);
    this.button.addEventListener("mousedown", this.handleToggleMouseDown);
    this.tilesElement.addEventListener("keydown", this.handleTileKeyDown);
    this.viewport.addEventListener("wheel", this.handleWheel, { passive: false });
    this.document.addEventListener("mousedown", this.handleOutside, true);
    this.document.addEventListener("touchstart", this.handleOutside, true);
    this.document.addEventListener("keydown", this.handleKeyDown, true);
    this.domWindow.addEventListener("blur", this.handleBlur);
    this.domWindow.addEventListener("lumine:native-caption-mousedown", this.handleBlur);

    this.tileObserver = new this.domWindow.MutationObserver(() => {
      this.updateTileAccessibility();
      this.scheduleLayout();
    });
    this.tileObserver.observe(tilesElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    this.chromeObserver = new this.domWindow.MutationObserver(() => this.scheduleLayout());
    this.chromeObserver.observe(element, { attributes: true, attributeFilter: ["class", "style"] });
    if (typeof this.domWindow.ResizeObserver === "function") {
      this.resizeObserver = new this.domWindow.ResizeObserver(() => this.scheduleLayout());
      // Never observe the animated viewport: its intermediate widths must not
      // become inputs to the collision decision.
      for (const target of [
        tilesElement,
        titleElement,
        windowButtonsElement,
        appIcon,
        menuElement,
      ]) {
        if (target) this.resizeObserver.observe(target);
      }
    }
    this.updateTileAccessibility();
  }

  updateTileAccessibility() {
    for (const [tile, attributes] of this.managedTiles) {
      if (!this.tilesElement.contains(tile) || tile.querySelector(INTERACTIVE)) {
        this.restoreTileAccessibility(tile, attributes);
        this.managedTiles.delete(tile);
      }
    }
    for (const tile of this.tilesElement.querySelectorAll("title-bar-tile")) {
      if (
        this.managedTiles.has(tile) ||
        tile.hasAttribute("role") ||
        tile.hasAttribute("tabindex") ||
        tile.querySelector(INTERACTIVE) ||
        tile.onkeydown
      )
        continue;
      this.managedTiles.set(tile, {
        role: tile.getAttribute("role"),
        tabindex: tile.getAttribute("tabindex"),
      });
      tile.setAttribute("role", "button");
      tile.tabIndex = 0;
    }
  }

  restoreTileAccessibility(tile, attributes) {
    if (tile.getAttribute("role") === "button") {
      if (attributes.role === null) tile.removeAttribute("role");
      else tile.setAttribute("role", attributes.role);
    }
    if (tile.getAttribute("tabindex") === "0") {
      if (attributes.tabindex === null) tile.removeAttribute("tabindex");
      else tile.setAttribute("tabindex", attributes.tabindex);
    }
  }

  layout({ titleRect, titleGap }) {
    if (this.destroyed) return;
    const barRect = this.element.getBoundingClientRect();
    if (barRect.width <= 0 || barRect.height <= 0) return;
    const naturalWidth = this.tilesElement.getBoundingClientRect().width;
    const reverse = this.element.classList.contains("reverse-controls");
    const buttonsRect = this.windowButtonsElement.getBoundingClientRect();
    const slotStyle = this.domWindow.getComputedStyle(this.slot);
    const gap = parseFloat(reverse ? slotStyle.marginLeft : slotStyle.marginRight) || 0;
    const edge = reverse
      ? (buttonsRect.width > 0 ? buttonsRect.right : barRect.left) + gap
      : (buttonsRect.width > 0 ? buttonsRect.left : barRect.right) - gap;
    // scrollWidth retains the complete text width when the centered title is
    // ellipsized. Using it prevents collapse/expand oscillation at that limit.
    const naturalTitleWidth = Math.max(
      titleRect.right - titleRect.left,
      this.titleElement.scrollWidth,
    );
    const center = barRect.left + barRect.width / 2;
    const available = reverse
      ? center - naturalTitleWidth / 2 - titleGap - edge
      : edge - center - naturalTitleWidth / 2 - titleGap;
    const collapsed = naturalWidth > 0 && naturalWidth > Math.max(0, available);
    this.setCollapsed(collapsed);

    let titleLeft = barRect.left;
    let titleRight = barRect.right;
    for (const obstacle of [
      this.appIcon,
      this.windowButtonsElement,
      naturalWidth > 0 ? this.slot : null,
    ]) {
      if (!obstacle) continue;
      const rect = obstacle.getBoundingClientRect();
      if (rect.width <= 0) continue;
      if ((rect.left + rect.right) / 2 < center) titleLeft = Math.max(titleLeft, rect.right);
      else titleRight = Math.min(titleRight, rect.left);
    }
    const titleWidth = `${Math.max(0, Math.floor(2 * (Math.min(center - titleLeft, titleRight - center) - titleGap)))}px`;
    if (this.titleElement.style.maxWidth !== titleWidth)
      this.titleElement.style.maxWidth = titleWidth;

    if (!collapsed) return;
    // Changing the flex slot to its button width can move fixed chrome in an
    // extremely narrow window. Read the final position before constraining
    // expansion, keeping the logo and the application's own menu usable.
    const buttonRect = this.button.getBoundingClientRect();
    let boundary = reverse ? barRect.right : barRect.left;
    for (const obstacle of [this.appIcon, this.menuElement]) {
      if (!obstacle) continue;
      const rect = obstacle.getBoundingClientRect();
      if (rect.width <= 0) continue;
      boundary = reverse ? Math.min(boundary, rect.left) : Math.max(boundary, rect.right);
    }
    const expansionWidth = Math.max(
      0,
      Math.min(
        naturalWidth,
        reverse ? boundary - buttonRect.right - titleGap : buttonRect.left - boundary - titleGap,
      ),
    );
    const width = `${Math.floor(expansionWidth)}px`;
    if (this.slot.style.getPropertyValue("--control-tiles-expanded-width") !== width) {
      this.slot.style.setProperty("--control-tiles-expanded-width", width);
    }
  }

  setCollapsed(collapsed) {
    if (this.collapsed === collapsed) return;
    this.collapsed = collapsed;
    if (!collapsed) this.close();
    this.element.classList.toggle("controls-collapsed", collapsed);
    this.button.hidden = !collapsed;
    this.setStripHidden(collapsed && !this.expanded);
  }

  setStripHidden(hidden) {
    this.viewport.inert = hidden;
    if (hidden) this.viewport.setAttribute("aria-hidden", "true");
    else this.viewport.removeAttribute("aria-hidden");
  }

  open({ focus = false } = {}) {
    if (this.destroyed || !this.collapsed || this.expanded) return false;
    this.expanded = true;
    this.element.classList.add("controls-expanded");
    this.button.setAttribute("aria-expanded", "true");
    this.button.setAttribute("aria-label", "Hide title bar controls");
    this.setStripHidden(false);
    this.viewport.scrollLeft = 0;
    this.updateTileAccessibility();
    if (focus) this.focusFirstControl();
    return true;
  }

  focusFirstControl() {
    const target = Array.from(this.tilesElement.querySelectorAll(INTERACTIVE)).find(
      (control) =>
        control.tabIndex >= 0 &&
        !control.disabled &&
        control.getClientRects().length > 0 &&
        this.domWindow.getComputedStyle(control).visibility !== "hidden",
    );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  close({ restoreFocus = false } = {}) {
    if (!this.expanded) return false;
    this.contextViews?.hideOwnedBy(this.tilesElement, { cancelled: true, restoreFocus: false });
    this.expanded = false;
    this.element.classList.remove("controls-expanded");
    this.button.setAttribute("aria-expanded", "false");
    this.button.setAttribute("aria-label", "Show title bar controls");
    this.setStripHidden(this.collapsed);
    if (restoreFocus) this.button.focus({ preventScroll: true });
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.close();
    this.destroyed = true;
    this.tileObserver.disconnect();
    this.chromeObserver.disconnect();
    this.resizeObserver?.disconnect();
    this.button.removeEventListener("click", this.handleToggle);
    this.button.removeEventListener("mousedown", this.handleToggleMouseDown);
    this.tilesElement.removeEventListener("keydown", this.handleTileKeyDown);
    this.viewport.removeEventListener("wheel", this.handleWheel);
    this.document.removeEventListener("mousedown", this.handleOutside, true);
    this.document.removeEventListener("touchstart", this.handleOutside, true);
    this.document.removeEventListener("keydown", this.handleKeyDown, true);
    this.domWindow.removeEventListener("blur", this.handleBlur);
    this.domWindow.removeEventListener("lumine:native-caption-mousedown", this.handleBlur);
    for (const [tile, attributes] of this.managedTiles)
      this.restoreTileAccessibility(tile, attributes);
    this.managedTiles.clear();
    this.slot.before(this.tilesElement);
    this.slot.remove();
    this.element.classList.remove("controls-collapsed", "controls-expanded");
    this.titleElement.style.maxWidth = "";
  }
}

module.exports = { ControlOverflow };
