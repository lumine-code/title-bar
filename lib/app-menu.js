const { MenuLabel } = require("./label.js");
const { MenuItem } = require("./item.js");
const { Utils } = require("./utils.js");
const { Config } = require("./types.js");

const nativeSessionModuleNonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let nextApplicationMenuInstanceId = 0;

function shouldUseGlobalApplicationMenu(customMenus, platform = process.platform) {
  return customMenus === false && platform === "darwin";
}

class ApplicationMenu {
  constructor(element, parent) {
    this.element = element;
    // The live settings object the bar owns, held by reference so a config
    // change reaches this menu without a broadcast. A menu built without a
    // bar behind it -- a spec, in practice -- falls back to the defaults.
    this.configState = parent?.getConfigState?.() ?? new Config();
    this.labels = [];
    this.attentive = false;
    this.showingAltKeys = false;
    this.parent = parent;
    this.platform = parent?.getPlatform?.() ?? process.platform;
    this.cachedOpenLeaf = null;
    this._skipBlurCount = 0;
    this.overflowStartIndex = this.labels.length;
    this.portalContainer = null;
    this.nativeSessionNamespace = `${nativeSessionModuleNonce}-${++nextApplicationMenuInstanceId}`;
    this.nativeSessionToken = 0;
    this.activeNativeSession = null;
    this.activeNativeLabel = null;
    this.activeNativeHoverTarget = null;
    this.nativeHoverTargets = new Map();
    this.nativePopupPromise = null;
    this.focusMenuTimer = null;

    this.overflowLabel = MenuLabel.createMenuLabel({ label: "...", submenu: [] });
    this.overflowLabel.setParent(this);
    this.overflowLabel.getElement().classList.add("overflow-menu-label", "overflowed");
    this.overflowLabel.getElement().setAttribute("aria-label", "More application menus");
    this.element.appendChild(this.overflowLabel.getElement());

    // Store handler references for cleanup
    this.clickHandler = () => this.blur();
    this.keydownHandler = (e) => this.onKeyDown(e);
    this.keyupHandler = (e) => this.onKeyUp(e);
    this.wheelHandler = (e) => this.onWheel(e);

    window.addEventListener("click", this.clickHandler);
    // Capture phase so an alt-scroll gesture cancels menu activation no matter
    // where it originates or whether an inner handler stops propagation.
    window.addEventListener("wheel", this.wheelHandler, { capture: true, passive: true });
    this.paneItemDisposable = lumine.workspace.onDidChangeActivePaneItem(() => this.blur());

    document.body.addEventListener("keydown", this.keydownHandler);
    document.body.addEventListener("keyup", this.keyupHandler);

    this.nativePopupSwitchSubscription =
      typeof lumine.window.onDidRequestApplicationMenuPopupSwitch === "function"
        ? lumine.window.onDidRequestApplicationMenuPopupSwitch((request) =>
            this.onNativeMenuPopupSwitch(request),
          )
        : null;
  }

  static createApplicationMenu(menuTemplate, parent) {
    const menuElement = document.createElement("div");
    menuElement.classList.add("app-menu");

    const self = new ApplicationMenu(menuElement, parent);

    self.labels = [];
    menuTemplate.forEach((o) => {
      try {
        self.addLabel(MenuLabel.createMenuLabel(o));
      } catch (e) {
        console.error(e);
      }
    });

    return self;
  }

  serialize() {
    return this.labels.map((o) => {
      return o.serialize();
    });
  }

  onLabelClicked(target, _event) {
    if (!this.usesCustomMenus()) {
      this.openNativeMenu(target, "mouse");
      return;
    }

    this.openCustomMenu(target, { toggle: true });
  }

  openCustomMenu(target, { selectFirst = false, toggle = false } = {}) {
    this.cachedOpenLeaf = null; // Invalidate cache
    if (toggle && target.isOpen()) {
      target.setOpen(false);
      return;
    }
    this.getAllLabels().forEach((o) => {
      o.setOpen(false);
    });
    target.setOpen(true);
    if (selectFirst) target.getSubmenu()?.selectFirstItem();
  }

  // With one menu already open, moving onto another opens it, the way a native
  // menu bar behaves once it has been entered.
  onLabelMouseEnter(target, e) {
    if (this.usesCustomMenus() && this.isOpen() && !target.isOpen()) {
      this.onLabelClicked(target, e);
    } else if (
      !this.usesCustomMenus() &&
      !this.usesGlobalApplicationMenu() &&
      this.activeNativeSession !== null &&
      target !== this.activeNativeLabel
    ) {
      this.openNativeMenu(target, "mouse");
    }
  }

  usesCustomMenus() {
    return this.configState.customMenus !== false;
  }

  usesGlobalApplicationMenu() {
    return shouldUseGlobalApplicationMenu(this.configState.customMenus, this.platform);
  }

  canInteract() {
    return !this.usesGlobalApplicationMenu();
  }

  openNativeMenu(target, sourceType, anchor = target) {
    if (this.usesCustomMenus() || this.usesGlobalApplicationMenu()) {
      return Promise.resolve(false);
    }

    const anchorElement = anchor?.getElement?.();
    if (!anchorElement) return Promise.resolve(false);
    const rect = anchorElement.getBoundingClientRect();
    const position = {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.bottom)),
      sourceType,
    };
    let request;
    if (target === this.overflowLabel) {
      const ids = this.labels.slice(this.overflowStartIndex).map((label) => label.getId());
      if (
        ids.length === 0 ||
        ids.some((id) => typeof id !== "string" || id.length === 0) ||
        new Set(ids).size !== ids.length
      ) {
        return Promise.resolve(false);
      }
      request = { kind: "overflow", ids, ...position };
    } else {
      const id = target?.getId?.();
      if (typeof id !== "string" || id.length === 0) return Promise.resolve(false);
      request = { kind: "submenu", id, ...position };
    }

    return this.showNativeMenu(request, anchor);
  }

  getNativeHoverTargetBounds(label) {
    const element = label?.getElement?.();
    if (!element || element.classList.contains("overflowed")) return null;

    const rect = element.getBoundingClientRect();
    if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return null;

    const x = Math.max(0, Math.floor(rect.left));
    const y = Math.max(0, Math.floor(rect.top));
    const right = Math.max(x, Math.ceil(rect.right));
    const bottom = Math.max(y, Math.ceil(rect.bottom));
    const width = right - x;
    const height = bottom - y;
    if (width === 0 || height === 0) return null;
    return { x, y, width, height };
  }

  buildNativeHoverTargets(token) {
    const entries = [];
    this.labels.slice(0, this.overflowStartIndex).forEach((label, index) => {
      const id = label.getId();
      const bounds = this.getNativeHoverTargetBounds(label);
      if (typeof id !== "string" || id.length === 0 || !bounds) return;
      entries.push({
        label,
        descriptor: {
          key: `${this.nativeSessionNamespace}:${token}:submenu:${index}`,
          kind: "submenu",
          id,
          bounds,
        },
      });
    });

    if (this.overflowStartIndex < this.labels.length) {
      const ids = this.labels.slice(this.overflowStartIndex).map((label) => label.getId());
      const bounds = this.getNativeHoverTargetBounds(this.overflowLabel);
      if (
        bounds &&
        ids.length > 0 &&
        ids.every((id) => typeof id === "string" && id.length > 0) &&
        new Set(ids).size === ids.length
      ) {
        entries.push({
          label: this.overflowLabel,
          descriptor: {
            key: `${this.nativeSessionNamespace}:${token}:overflow`,
            kind: "overflow",
            ids,
            bounds,
          },
        });
      }
    }

    return entries;
  }

  nativeSwitchTargetMatches(expected, actual) {
    if (!actual || expected.key !== actual.key || expected.kind !== actual.kind) return false;
    if (expected.kind === "submenu") return expected.id === actual.id;
    return (
      Array.isArray(actual.ids) &&
      expected.ids.length === actual.ids.length &&
      expected.ids.every((id, index) => id === actual.ids[index])
    );
  }

  onNativeMenuPopupSwitch(request) {
    if (
      this.usesCustomMenus() ||
      this.usesGlobalApplicationMenu() ||
      this.activeNativeSession === null ||
      !request ||
      request.from !== this.activeNativeHoverTarget ||
      !request.target
    ) {
      return;
    }

    const entry = this.nativeHoverTargets.get(request.target.key);
    if (
      !entry ||
      entry.descriptor.key === this.activeNativeHoverTarget ||
      !this.nativeSwitchTargetMatches(entry.descriptor, request.target)
    ) {
      return;
    }

    this.openNativeMenu(entry.label, "mouse");
  }

  showNativeMenu(request, activeLabel) {
    const closeResult = this.cancelNativeMenu({ applyAutoHide: false });
    const token = ++this.nativeSessionToken;
    const hoverEntries = this.buildNativeHoverTargets(token);
    const activeHoverEntry = hoverEntries.find((entry) => entry.label === activeLabel);
    if (!activeHoverEntry) {
      return Promise.resolve(closeResult)
        .catch((error) => {
          console.error("Unable to close the previous native application menu popup", error);
        })
        .then(() => false);
    }

    this.nativeHoverTargets = new Map(hoverEntries.map((entry) => [entry.descriptor.key, entry]));
    this.activeNativeHoverTarget = activeHoverEntry.descriptor.key;
    request = {
      ...request,
      hoverTargets: hoverEntries.map((entry) => entry.descriptor),
      activeHoverTarget: activeHoverEntry.descriptor.key,
    };
    this.activeNativeSession = token;
    this.activeNativeLabel = activeLabel;
    this.getAllLabels().forEach((label) => {
      label.setOpen(false);
      label.setFocused(label === activeLabel);
    });
    this.attentive = false;

    const pending = Promise.resolve(closeResult)
      .catch((error) => {
        console.error("Unable to close the previous native application menu popup", error);
      })
      .then(() => {
        if (this.activeNativeSession !== token) return false;
        if (typeof lumine.window.showApplicationMenuPopup !== "function") return false;
        return lumine.window.showApplicationMenuPopup(request);
      })
      .then(
        (result) => {
          this.finishNativeMenu(token);
          return result === true;
        },
        (error) => {
          this.finishNativeMenu(token);
          console.error("Unable to show the native application menu popup", error);
          return false;
        },
      );
    this.nativePopupPromise = pending;
    return pending;
  }

  finishNativeMenu(token, { applyAutoHide = true } = {}) {
    if (this.activeNativeSession !== token) return;
    this.activeNativeSession = null;
    this.nativePopupPromise = null;
    this.activeNativeHoverTarget = null;
    this.nativeHoverTargets.clear();
    this.activeNativeLabel?.setFocused(false);
    this.activeNativeLabel = null;
    this.getFocusedLabel()?.setFocused(false);
    this._skipBlurCount = 0;
    this.attentive = false;
    this.showAltKeys(false);
    if (applyAutoHide && this.configState.autoHide) {
      this.parent?.setMenuBarVisible(false);
    }
  }

  cancelNativeMenu({ applyAutoHide = true } = {}) {
    if (this.activeNativeSession === null) return false;
    const token = this.activeNativeSession;
    ++this.nativeSessionToken;
    this.finishNativeMenu(token, { applyAutoHide });
    if (typeof lumine.window.closeApplicationMenuPopup !== "function") return false;
    try {
      const result = lumine.window.closeApplicationMenuPopup();
      if (result && typeof result.catch === "function") {
        return result.catch((error) => {
          console.error("Unable to close the native application menu popup", error);
          return false;
        });
      }
      return result;
    } catch (error) {
      console.error("Unable to close the native application menu popup", error);
      return false;
    }
  }

  onMenuModeChanged() {
    this.cancelFocusMenuTimer();
    this._skipBlurCount = 0;
    this.cancelNativeMenu();
    this.closeCustomMenus();
    this.getFocusedLabel()?.setFocused(false);
    this.attentive = false;
    this.showAltKeys(false);
  }

  onKeyDown(e) {
    if (!this.canInteract()) return;
    // Only Escape closes the menu (not Alt) - Alt toggle is handled separately
    if (
      !e.repeat &&
      e.key === "Escape" &&
      (this.showingAltKeys || this.isOpen() || this.isFocused())
    ) {
      this.close();
      this.getFocusedLabel()?.setFocused(false);
      this.attentive = false;
      this.showAltKeys(false);
      return;
    }

    if (e.key === "Alt") {
      if (e.repeat) {
        return;
      }
      // Don't handle Alt if title bar is hidden
      if (!this.parent?.isTitleBarVisible()) {
        return;
      }
      // Only handle Alt if altGivesFocus is enabled
      if (!this.configState.altGivesFocus) {
        return;
      }
      // Neither the pending activation nor the mnemonic underlines toggle
      // while a menu is already open or focused -- Alt is then part of a
      // shortcut being typed into it, not a request to arm the menu bar.
      if (!this.isOpen() && !this.isFocused()) {
        this.attentive = !this.attentive;
        this.showAltKeys(!this.showingAltKeys);
      }
      return;
    }

    const openLabel = this.getOpenLabel();
    const focusedLabel = this.getFocusedLabel();
    if (openLabel) {
      let selected = this.getSelectedLeaf();
      switch (e.key) {
        case "ArrowUp": {
          this.cachedOpenLeaf = null; // Invalidate cache (submenu may have opened via hover)
          const openLeaf = this.getOpenLeaf();
          // If there's an open submenu deeper than the main menu, navigate there
          if (openLeaf && !(openLeaf instanceof MenuLabel)) {
            const submenu = openLeaf.getSubmenu();
            const submenuSelected = submenu.getSelected();
            if (submenuSelected) {
              submenu.selectPreviousItem(true); // wrap=true for submenus
            } else {
              submenu.selectLastItem();
            }
          } else if (!selected) {
            openLeaf.getSubmenu().selectLastItem();
          } else {
            // Wrap only in nested submenus (parent is MenuItem, not MenuLabel)
            const wrapUp = !(selected.getParent() instanceof MenuLabel);
            selected.getParent()?.getSubmenu()?.selectPreviousItem(wrapUp);
          }
          Utils.stopEvent(e);
          return;
        }

        case "ArrowDown": {
          this.cachedOpenLeaf = null; // Invalidate cache (submenu may have opened via hover)
          const openLeaf = this.getOpenLeaf();
          // If there's an open submenu deeper than the main menu, navigate there
          if (openLeaf && !(openLeaf instanceof MenuLabel)) {
            const submenu = openLeaf.getSubmenu();
            const submenuSelected = submenu.getSelected();
            if (submenuSelected) {
              submenu.selectNextItem(true); // wrap=true for submenus
            } else {
              submenu.selectFirstItem();
            }
          } else if (!selected) {
            openLeaf.getSubmenu().selectFirstItem();
          } else {
            // Wrap only in nested submenus (parent is MenuItem, not MenuLabel)
            const wrapDown = !(selected.getParent() instanceof MenuLabel);
            selected.getParent()?.getSubmenu()?.selectNextItem(wrapDown);
          }
          Utils.stopEvent(e);
          return;
        }

        case "ArrowLeft":
          this.cachedOpenLeaf = null; // Invalidate cache
          if (!selected || selected.getParent() instanceof MenuLabel) {
            this.openPreviousLabel();
          } else {
            selected.getParent()?.setOpen(false);
            selected.getParent()?.setSelected(true);
          }
          Utils.stopEvent(e);
          return;

        case "ArrowRight":
          this.cachedOpenLeaf = null; // Invalidate cache
          if (!selected || !selected.hasSubmenu()) {
            this.openNextLabel();
          } else {
            // Close sibling submenus before opening this one
            selected
              .getParent()
              ?.getSubmenu()
              ?.forEach((o) => {
                if (o !== selected) {
                  o.setOpen(false);
                }
              });
            selected.setOpen(true);
            selected.getSubmenu()?.selectFirstItem();
          }
          Utils.stopEvent(e);
          return;

        case "Enter":
          if (selected && !selected.hasSubmenu()) {
            selected.execCommand();
            this.close();
            this.attentive = false;
            this.showAltKeys(false);
            Utils.stopEvent(e);
            return;
          }
          break;

        case " ": // Space
          if (selected && !selected.hasSubmenu()) {
            selected.bounce();
            selected.execCommand();
            Utils.stopEvent(e);
            return;
          }
          break;
      }

      if (this.showingAltKeys && !e.repeat) {
        let target = this.getOpenLeaf();
        if (target) {
          let handled = false;

          target
            .getSubmenu()
            ?.getSelectable()
            .some((o) => {
              if (o.getAltTrigger() !== undefined && o.getAltTrigger() === e.key.toLowerCase()) {
                o.execCommand();
                this.close();
                this.attentive = false;
                this.showAltKeys(false);
                Utils.stopEvent(e);
                handled = true;
                return true;
              }
              return false;
            });

          if (handled) {
            return;
          }
        }
      }
    } else {
      if (focusedLabel) {
        switch (e.key) {
          case "Enter":
          case "ArrowDown":
            if (this.usesCustomMenus()) {
              this.openCustomMenu(focusedLabel, { selectFirst: true });
            } else {
              this.openNativeMenu(focusedLabel, "keyboard");
            }
            Utils.stopEvent(e);
            return;

          case "ArrowUp":
            // Just stop event, nothing to navigate up to when focused
            Utils.stopEvent(e);
            return;

          case "ArrowLeft":
            this.focusPreviousLabel();
            Utils.stopEvent(e);
            return;

          case "ArrowRight":
            this.focusNextLabel();
            Utils.stopEvent(e);
            return;
        }
      }
      // Only handle label mnemonics if menu bar is visible
      if (this.showingAltKeys && !e.repeat && this.parent?.isMenuBarVisible()) {
        let handled = false;

        this.labels.some((o, index) => {
          if (o.getAltTrigger() !== undefined && o.getAltTrigger() === e.key.toLowerCase()) {
            if (focusedLabel) {
              focusedLabel.setFocused(false);
            }
            if (!this.usesCustomMenus()) {
              const anchor = index < this.overflowStartIndex ? o : this.overflowLabel;
              this.openNativeMenu(o, "keyboard", anchor);
            } else if (index < this.overflowStartIndex) {
              this.openCustomMenu(o);
            } else {
              const overflowItem = this.overflowLabel.getSubmenu()[index - this.overflowStartIndex];
              this.overflowLabel.setOpen(true);
              overflowItem?.setOpen(true);
              overflowItem?.getSubmenu()?.selectFirstItem();
            }
            Utils.stopEvent(e);
            handled = true;
            return true;
          }
          return false;
        });

        if (handled) {
          return;
        }
      }
    }

    if (this.shouldCloseOnUnhandledKey(e)) {
      this.close();
      this.getFocusedLabel()?.setFocused(false);
      this.attentive = false;
      this.showAltKeys(false);
      return;
    }

    this.attentive = false;
    this.showAltKeys(false);
  }

  shouldCloseOnUnhandledKey(e) {
    if (!this.showingAltKeys && !this.isOpen() && !this.isFocused()) {
      return false;
    }

    if (this.isStandaloneModifierKeyEvent(e)) {
      return false;
    }

    return true;
  }

  isStandaloneModifierKeyEvent(e) {
    switch (e.key) {
      case "Control":
      case "Alt":
      case "Shift":
      case "Meta":
        return true;
      default:
        return false;
    }
  }

  onWheel(e) {
    // An alt-scroll gesture cancels the pending "Alt activates the menu"
    // action, mirroring native menu-bar behavior where any intervening action
    // during the Alt hold aborts activation. Only act while an Alt hold is
    // actually pending so ordinary scrolling stays a no-op.
    if (!e.altKey || !(this.attentive || this.showingAltKeys)) {
      return;
    }
    // Gate on the same state the editor uses to amplify alt-wheel scrolling
    // (`editor.altWheelMultiplier !== 1`). When the multiplier is disabled the
    // alt+wheel is not an alt-scroll gesture, so leave menu activation intact.
    const editorElement = e.target?.closest?.("lumine-text-editor:not([mini])");
    const editor = editorElement?.getModel?.() ?? lumine.workspace.getActiveTextEditor();
    const configOptions = editor ? { scope: editor.getRootScopeDescriptor() } : {};
    if (lumine.config.get("editor.altWheelMultiplier", configOptions) === 1) {
      return;
    }
    this.attentive = false;
    this.showAltKeys(false);
  }

  onKeyUp(e) {
    if (!this.canInteract()) {
      this.attentive = false;
      this.showAltKeys(false);
      return;
    }
    if (e.key === "Alt" && !this.isFocused() && !this.isOpen()) {
      // Don't handle Alt if title bar is hidden
      if (!this.parent?.isTitleBarVisible()) {
        this.attentive = false;
        return;
      }

      if (this.showingAltKeys) {
        if (!this.configState.altGivesFocus && !this.configState.autoHide) {
          this.showAltKeys(false);
        }
      }

      if (this.attentive) {
        if (this.configState.autoHide) {
          this.parent?.setMenuBarVisible(true);
        }

        if (this.configState.altGivesFocus) {
          this.focusFirstLabel();
        }
      }

      this.attentive = false;
    }
  }

  blur() {
    if (this._skipBlurCount > 0) {
      this._skipBlurCount--;
      return;
    }
    this.close();
    this.getFocusedLabel()?.setFocused(false);
    this.attentive = false;
    this.showAltKeys(false);
  }

  focusMenuCommand() {
    if (!this.canInteract()) return;
    this.cancelFocusMenuTimer();
    this._skipBlurCount = 2;
    this.focusMenuTimer = setTimeout(() => {
      this.focusMenuTimer = null;
      if (this.canInteract()) this.focusFirstLabel();
    }, 0);
  }

  cancelFocusMenuTimer() {
    if (this.focusMenuTimer === null) return;
    clearTimeout(this.focusMenuTimer);
    this.focusMenuTimer = null;
  }

  close() {
    this.cancelNativeMenu();
    this.closeCustomMenus();
  }

  closeCustomMenus() {
    this.cachedOpenLeaf = null; // Invalidate cache
    this.getAllLabels().forEach((o) => {
      if (o.isOpen()) {
        o.setOpen(false);
      }
    });

    if (this.configState.autoHide) {
      this.parent?.setMenuBarVisible(false);
    }
  }

  showAltKeys(flag) {
    Utils.setToggleClass(this.element, "alt-down", flag);
    this.showingAltKeys = flag;
  }

  openFirstLabel() {
    this.getNavigableLabels()[0]?.setOpen(true);
  }

  openLastLabel() {
    const labels = this.getNavigableLabels();
    labels[labels.length - 1]?.setOpen(true);
  }

  openNextLabel() {
    let label = this.getOpenLabel();
    if (label) {
      const labels = this.getNavigableLabels();
      label.setOpen(false);
      labels[Utils.mod(labels.indexOf(label) + 1, labels.length)]?.setOpen(true);
    }
  }

  openPreviousLabel() {
    let label = this.getOpenLabel();
    if (label) {
      const labels = this.getNavigableLabels();
      label.setOpen(false);
      labels[Utils.mod(labels.indexOf(label) - 1, labels.length)]?.setOpen(true);
    }
  }

  focusFirstLabel() {
    const labels = this.getNavigableLabels();
    this.getAllLabels().forEach((o) => {
      o.setFocused(false);
    });
    labels[0]?.setFocused(true);
  }

  focusLastLabel() {
    const labels = this.getNavigableLabels();
    this.getAllLabels().forEach((o) => {
      o.setFocused(false);
    });
    labels[labels.length - 1]?.setFocused(true);
  }

  focusNextLabel() {
    let label = this.getFocusedLabel();
    if (label) {
      const labels = this.getNavigableLabels();
      label.setFocused(false);
      labels[Utils.mod(labels.indexOf(label) + 1, labels.length)]?.setFocused(true);
    }
  }

  focusPreviousLabel() {
    let label = this.getFocusedLabel();
    if (label) {
      const labels = this.getNavigableLabels();
      label.setFocused(false);
      labels[Utils.mod(labels.indexOf(label) - 1, labels.length)]?.setFocused(true);
    }
  }

  getOpenLeaf() {
    if (this.cachedOpenLeaf !== null) {
      return this.cachedOpenLeaf;
    }

    let result = null;

    const recurseItem = (item) => {
      let curr = null;
      item.getSubmenu()?.some((o) => {
        if (o.hasSubmenu() && o.isOpen()) {
          curr = o;
          let tmp = recurseItem(o);
          if (tmp !== null) {
            curr = tmp;
          }
          return true;
        }
        return false;
      });
      return curr;
    };

    this.getNavigableLabels().some((o) => {
      if (o.isOpen()) {
        result = o;
        let tmp = recurseItem(o);
        if (tmp !== null) {
          result = tmp;
        }
        return true;
      }
      return false;
    });

    this.cachedOpenLeaf = result;
    return result;
  }

  getSelectedLeaf() {
    let result = null;

    const recurseItem = (item) => {
      let curr = null;
      item.getSubmenu()?.some((o) => {
        if (o.isSelected()) {
          curr = o;
        }
        // Recurse into open submenus even if parent not selected
        if (o.hasSubmenu() && o.isOpen()) {
          let tmp = recurseItem(o);
          if (tmp !== null) {
            curr = tmp;
          }
          return true;
        }
        return false;
      });
      return curr;
    };

    this.getNavigableLabels().some((o) => {
      if (o.isOpen()) {
        let tmp = recurseItem(o);
        if (tmp !== null) {
          result = tmp;
        }
        return true;
      }
      return false;
    });

    return result;
  }

  getOpenLabel() {
    return this.getNavigableLabels().find((o) => o.isOpen()) || null;
  }

  getFocusedLabel() {
    return this.getNavigableLabels().find((o) => o.isFocused()) || null;
  }

  getElement() {
    return this.element;
  }

  getLabels() {
    return this.labels;
  }

  getAllLabels() {
    return [...this.labels, this.overflowLabel];
  }

  getNavigableLabels() {
    return this.getAllLabels().filter(
      (label) => !label.getElement().classList.contains("overflowed"),
    );
  }

  getOverflowStartIndex() {
    return this.overflowStartIndex;
  }

  setOverflowStartIndex(index, force = false) {
    const overflowStartIndex = Math.max(0, Math.min(index, this.labels.length));
    if (!force && overflowStartIndex === this.overflowStartIndex) {
      return;
    }

    this.cachedOpenLeaf = null;
    this.overflowLabel.setOpen(false);
    this.overflowLabel.setFocused(false);
    this.clearOverflowItems();
    this.overflowStartIndex = overflowStartIndex;

    this.labels.forEach((label, labelIndex) => {
      const overflowed = labelIndex >= overflowStartIndex;
      label.getElement().classList.toggle("overflowed", overflowed);
      if (overflowed) {
        label.setOpen(false);
        label.setFocused(false);
        this.overflowLabel.addChild(
          MenuItem.createMenuItem({
            label: label.getLabelText(),
            submenu: label.getSubmenu().map((item) => item.serialize()),
          }),
        );
      }
    });

    const hasOverflow = overflowStartIndex < this.labels.length;
    this.overflowLabel.getElement().classList.toggle("overflowed", !hasOverflow);
    if (hasOverflow && this.portalContainer) {
      this.overflowLabel.moveSubmenusToPortal(this.portalContainer);
    }
  }

  measureOverflowLabelWidth() {
    const element = this.overflowLabel.getElement();
    const wasOverflowed = element.classList.contains("overflowed");
    const previousVisibility = element.style.visibility;

    element.classList.remove("overflowed");
    element.style.visibility = "hidden";
    const width = element.getBoundingClientRect().width;
    element.style.visibility = previousVisibility;
    element.classList.toggle("overflowed", wasOverflowed);

    return width;
  }

  clearOverflowItems() {
    [...this.overflowLabel.getSubmenu()].forEach((item) => {
      this.removePortaledSubmenus(item);
      this.overflowLabel.removeChild(item);
    });
  }

  removePortaledSubmenus(item) {
    item.getSubmenu()?.forEach((child) => this.removePortaledSubmenus(child));
    item.portalElement?.remove();
  }

  isOpen() {
    return this.getOpenLabel() !== null;
  }

  isFocused() {
    return this.getFocusedLabel() !== null;
  }

  addLabel(labelItem) {
    labelItem.setParent(this);
    this.labels.push(labelItem);
    this.element.insertBefore(labelItem.getElement(), this.overflowLabel.getElement());
    this.overflowStartIndex = this.labels.length;
  }

  insertLabel(item, index) {
    const referenceElement = this.labels[index]?.getElement() || this.overflowLabel.getElement();
    item.setParent(this);
    this.labels.splice(index, 0, item);
    this.element.insertBefore(item.getElement(), referenceElement);
    this.setOverflowStartIndex(this.labels.length, true);
  }

  removeLabel(x) {
    if (x instanceof MenuLabel) {
      this.labels.splice(this.labels.indexOf(x), 1);
      x.getElement().parentElement?.removeChild(x.getElement());
      this.setOverflowStartIndex(this.labels.length, true);
      return;
    }

    const item = this.labels.splice(x, 1)[0];
    item?.getElement().parentElement?.removeChild(item?.getElement());
    this.setOverflowStartIndex(this.labels.length, true);
  }

  setupSubmenuPortals(portalContainer) {
    this.portalContainer = portalContainer;
    this.labels.forEach((label) => {
      label.moveSubmenusToPortal(portalContainer);
    });
    this.overflowLabel.moveSubmenusToPortal(portalContainer);
  }

  destroy() {
    this.cancelFocusMenuTimer();
    this._skipBlurCount = 0;
    this.cancelNativeMenu();
    window.removeEventListener("click", this.clickHandler);
    window.removeEventListener("wheel", this.wheelHandler, { capture: true });
    document.body.removeEventListener("keydown", this.keydownHandler);
    document.body.removeEventListener("keyup", this.keyupHandler);
    this.paneItemDisposable?.dispose();
    this.nativePopupSwitchSubscription?.dispose();
    this.nativePopupSwitchSubscription = null;
    this.clearOverflowItems();
  }
}

module.exports = { ApplicationMenu, shouldUseGlobalApplicationMenu };
