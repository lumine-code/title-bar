const { ApplicationMenu } = require("./app-menu.js");
const { Utils } = require("./utils.js");
const { ThemeManager } = require("./theme.js");
const { MenuUpdater } = require("./updater.js");
const { ContextMenuInterceptor } = require("./context-menu-interceptor.js");
const { ControlTiles } = require("./control-tiles.js");
const path = require("path");
const { pathToFileURL } = require("url");

// Debounce helper. `cancel` drops a pending call, so teardown does not leave
// work scheduled against a bar that has already been taken apart.
function debounce(fn, delay) {
  let timer = null;
  const debounced = function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

function calculateVisibleLabelCount(labelWidths, availableWidth, overflowWidth) {
  const totalWidth = labelWidths.reduce((sum, width) => sum + width, 0);
  if (totalWidth <= availableWidth) {
    return labelWidths.length;
  }

  let usedWidth = overflowWidth;
  let visibleCount = 0;
  for (const width of labelWidths) {
    if (usedWidth + width > availableWidth) {
      break;
    }
    usedWidth += width;
    visibleCount++;
  }

  return visibleCount;
}

function calculateAvailableMenuWidth(menuRect, titleRect, leadingWidth, titleGap, menuOnRight) {
  const availableWidth = menuOnRight
    ? menuRect.right - titleRect.right - leadingWidth - titleGap
    : titleRect.left - menuRect.left - leadingWidth - titleGap;
  return Math.max(0, availableWidth);
}

function resolveLaunchMode({ devMode, safeMode, sourceMode }) {
  // Safe mode is a warning state and always wins. From a source checkout
  // `sourceMode` (Electron's unpackaged `process.defaultApp`) is true even
  // though `--dev` is also set, so it must outrank dev to mark `npm start`
  // distinctly; a bare `--dev` window only appears in packaged builds.
  if (safeMode) return "safe";
  if (sourceMode) return "source";
  if (devMode) return "dev";
  return null;
}

// The icon file for a run mode -- the same normal/safe/dev mark
// src/lumine-window.js picks for the window and dock icon, so every surface
// agrees on color. Keyed off the two real flags rather than resolveLaunchMode
// -- there is no separate "source" icon, only the badge distinguishes it, so
// a source-mode (npm start) window still gets the dev-colored mark. Pulled
// out as its own pure function, like resolveLaunchMode, so it is testable
// without faking lumine.window.isDevMode()/lumine.window.isSafeMode() at the global level.
function resolveLaunchIconFile({ devMode, safeMode }) {
  if (safeMode) return "lumine-safe.svg";
  if (devMode) return "lumine-dev.svg";
  return "lumine.svg";
}

class TitleBarView {
  constructor(configState) {
    this.configState = configState;
    this.themeManager = new ThemeManager(this);
    this.contextMenuInterceptor = new ContextMenuInterceptor(configState);
    [this.element, this.titleElement, this.windowControls, this.appIcon, this.controlTilesElement] =
      this.createElement();
    this.controlTiles = new ControlTiles(this.controlTilesElement);
    this.titleBarVisible = true;
    this.menuBarVisible = true;
    this.windowState = { fullscreen: false, maximized: false, visible: false };
    this.windowStateSyncGeneration = 0;
    this.originalMenuUpdateFn = undefined;
    this.titleCollisionFrame = null;
    this.updateLaunchMode();

    this.debouncedCheckTitleCollision = debounce(() => this.checkTitleCollision(), 150);
    this.debouncedWindowStateSync = debounce(() => void this.syncWindowState(), 50);
    this.debouncedMenuUpdate = debounce(() => this.updateMenuImmediate(), 10);

    this.initWindowControls();
    void this.syncWindowState();
    this.handleTitleBarDoubleClick = this.handleTitleBarDoubleClick.bind(this);
    this.element.addEventListener("dblclick", this.handleTitleBarDoubleClick);

    // Chromium updates an existing <title> text node in place (characterData
    // mutation on the child), so childList alone misses most title changes
    this.titleObserver = new MutationObserver(() => this.updateTitleText());

    const realTitle = document.querySelector("title");
    if (realTitle !== null) {
      this.titleObserver.observe(realTitle, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    const menuTemplate = MenuUpdater.getTemplate();
    this.appMenu = ApplicationMenu.createApplicationMenu(menuTemplate, this);
    this.element.appendChild(this.appMenu.getElement());
    this.updateTitleText();

    // A submenu is drawn out of its parent box so the parent's scrolling
    // cannot clip it. The portal hangs off <body>, the way the context menu's
    // does, and not off the bar: the bar carries `contain: layout`, which makes
    // it the containing block for a fixed-position descendant, so a submenu
    // placed at viewport coordinates would land offset by the bar's own inset
    // and be capped inside the bar's stacking context. Set up before
    // attachMenuUpdater, which repopulates through it.
    this.submenuPortal = document.createElement("div");
    this.submenuPortal.classList.add("app-menu-submenu-portal");
    document.body.appendChild(this.submenuPortal);

    // Move submenus to portal for scroll support
    this.appMenu.setupSubmenuPortals(this.submenuPortal);

    this.attachMenuUpdater(false);

    // Show menu bar on the app icon hover when autoHide is enabled
    this.appIcon.addEventListener("mouseenter", () => {
      if (this.configState.autoHide) {
        this.setMenuBarVisible(true);
      }
    });

    this.themeDisposable = lumine.themes.onDidChangeActiveThemes(() => {
      this.updateTransforms();
      this.debouncedCheckTitleCollision();
    });

    // Activate custom context menus if enabled
    if (this.configState.customContextMenus) {
      this.contextMenuInterceptor.activate();
    }
  }

  createElement() {
    const element = document.createElement("div");
    element.classList.add("title-bar");

    // App icon at leftmost position
    const appIcon = document.createElement("div");
    appIcon.classList.add("app-icon");
    const logo = document.createElement("img");
    logo.width = 24;
    logo.height = 24;
    logo.alt = "";
    logo.setAttribute("aria-hidden", "true");
    logo.setAttribute("draggable", "false");
    appIcon.appendChild(logo);
    this.logoImage = logo; // src is set by updateLaunchMode(), not here
    appIcon.addEventListener("click", () => {
      lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "application:about");
    });
    element.appendChild(appIcon);

    const titleSpan = document.createElement("span");
    titleSpan.classList.add("custom-title");
    titleSpan.textContent = "Lumine";
    element.appendChild(titleSpan);

    // Control tiles container (for external packages to add items)
    const controlTilesWrap = document.createElement("div");
    controlTilesWrap.classList.add("control-tiles");
    element.appendChild(controlTilesWrap);

    // Window control buttons container
    const windowButtonsWrap = document.createElement("div");
    windowButtonsWrap.classList.add("window-buttons");

    const controlMinimize = document.createElement("button");
    controlMinimize.classList.add("btn-minimize");
    controlMinimize.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1"/></svg>';
    windowButtonsWrap.appendChild(controlMinimize);

    const controlMaximize = document.createElement("button");
    controlMaximize.classList.add("btn-maximize");
    controlMaximize.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
    windowButtonsWrap.appendChild(controlMaximize);

    const controlClose = document.createElement("button");
    controlClose.classList.add("btn-close");
    controlClose.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1"/></svg>';
    windowButtonsWrap.appendChild(controlClose);

    element.appendChild(windowButtonsWrap);

    return [
      element,
      titleSpan,
      {
        minimize: controlMinimize,
        maximize: controlMaximize,
        close: controlClose,
      },
      appIcon,
      controlTilesWrap,
    ];
  }

  async updateTransforms() {
    this.element.querySelectorAll(".menu-box.menu-item-submenu").forEach((o) => {
      const parentRect = o.parentElement?.getBoundingClientRect();
      o.style.transform = `translate(${parentRect.width}px, -3px)`;
    });
  }

  attachMenuUpdater(updateImmediately = true) {
    if (this.originalMenuUpdateFn === undefined) {
      this.originalMenuUpdateFn = lumine.menu.update;
    }

    lumine.menu.update = (...args) => {
      this.originalMenuUpdateFn?.apply(lumine.menu, args);
      this.debouncedMenuUpdate();
    };

    if (updateImmediately) {
      this.updateMenuImmediate();
    }
  }

  detachMenuUpdater() {
    if (this.originalMenuUpdateFn !== undefined) {
      lumine.menu.update = this.originalMenuUpdateFn;
    }
  }

  updateMenuImmediate() {
    const edits = MenuUpdater.run(this.appMenu);
    if (edits > 0) {
      // Re-setup portals for any new submenu items
      if (this.submenuPortal) {
        this.appMenu.setupSubmenuPortals(this.submenuPortal);
      }
      this.updateTransforms();
      this.debouncedCheckTitleCollision();
    }
  }

  initWindowControls() {
    this.windowSubscriptions = [
      lumine.window.onDidMaximize(() => {
        this.windowState.maximized = true;
        this.updateMaximizeControl();
      }),
      lumine.window.onDidUnmaximize(() => {
        this.windowState.maximized = false;
        this.updateMaximizeControl();
      }),
      lumine.window.onDidEnterFullScreen(() => {
        this.windowState.fullscreen = true;
        this.updateFullscreenState();
      }),
      lumine.window.onDidLeaveFullScreen(() => {
        this.windowState.fullscreen = false;
        this.updateFullscreenState();
      }),
      // Close the menu when the window loses focus. Dismissing it by
      // synthesising a click on `document.body` also worked, but every other
      // click listener in the editor got the event too.
      lumine.window.onDidBlur(() => {
        this.appMenu?.blur();
      }),
      lumine.window.onDidFocus(() => {
        void this.syncWindowState();
      }),
    ];

    this.handleWindowResize = () => {
      this.debouncedCheckTitleCollision();
      this.debouncedWindowStateSync();
    };
    window.addEventListener("resize", this.handleWindowResize);

    this.windowControls.minimize.addEventListener("click", () => {
      void lumine.window.minimize();
    });

    this.windowControls.maximize.addEventListener("click", () => {
      this.toggleMaximized();
    });

    this.windowControls.close.addEventListener("click", () => {
      void lumine.window.close();
    });

    this.updateMaximizeControl();
    this.updateFullscreenState();
  }

  async readWindowState() {
    const state = await lumine.window.getState();
    return {
      fullscreen: state.fullScreen,
      maximized: state.maximized,
      visible: state.visible,
    };
  }

  async syncWindowState() {
    const generation = ++this.windowStateSyncGeneration;
    const state = await this.readWindowState();
    if (generation !== this.windowStateSyncGeneration) return;
    this.windowState = state;
    this.updateMaximizeControl();
    this.updateFullscreenState();
  }

  async captureRestoreBounds() {
    const state = await lumine.window.getState();
    this.restoreBounds = { ...state.position, ...state.size };
  }

  restoreCapturedBounds() {
    if (!this.restoreBounds) return Promise.resolve();

    const { x, y, width, height } = this.restoreBounds;
    return Promise.all([lumine.window.setPosition(x, y), lumine.window.setSize(width, height)]);
  }

  updateMaximizeControl() {
    this.windowControls.maximize.innerHTML = this.windowState.maximized
      ? '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/><path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
      : '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
  }

  updateFullscreenState() {
    if (this.windowState.fullscreen) {
      this.windowControls.maximize.classList.add("disabled");
      // macOS keeps the bar in fullscreen: the menu is the only way back out
      // of it without a keystroke, and the traffic lights are revealed by the
      // system rather than drawn here.
      if (process.platform !== "darwin") {
        this.setTitleBarVisible(false);
      }
    } else {
      this.windowControls.maximize.classList.remove("disabled");
      this.setTitleBarVisible(true);
    }
  }

  async toggleMaximized() {
    if (this.windowState.fullscreen) return;

    const isMaximized = await lumine.window.isMaximized();
    const shouldMaximize = !isMaximized;

    if (shouldMaximize) {
      await this.captureRestoreBounds();
    }

    this.windowState.maximized = shouldMaximize;
    this.updateMaximizeControl();

    if (shouldMaximize) {
      await lumine.window.maximize();
    } else {
      await lumine.window.unmaximize();
      if (!(await lumine.window.isMaximized())) {
        await this.restoreCapturedBounds();
      }
      this.restoreBounds = null;
    }

    this.debouncedWindowStateSync();
  }

  async handleTitleBarDoubleClick(event) {
    if (
      event.target.closest(
        ".app-icon, .app-menu, .control-tiles, .window-buttons, button, input, select",
      )
    ) {
      return;
    }

    if (process.platform === "darwin") {
      const action = await lumine.app.getUserDefault("AppleActionOnDoubleClick", "string");

      if (action === "Minimize") {
        await lumine.window.minimize();
        return;
      }

      if (action && action !== "Maximize") return;
    }

    await this.toggleMaximized();
  }

  setTitleBarVisible(flag) {
    this.titleBarVisible = flag;
    Utils.setToggleClass(this.element, "no-title-bar", !flag);
    this.debouncedCheckTitleCollision();
  }

  setMenuBarVisible(flag) {
    this.menuBarVisible = flag;
    Utils.setToggleClass(this.appMenu.getElement(), "no-menu-bar", !flag);
  }

  updateTitleText() {
    const realTitle = document.querySelector("title");
    if (realTitle !== null) {
      this.titleElement.textContent = realTitle.textContent || "Lumine";
      this.debouncedCheckTitleCollision();
    }
  }

  checkTitleCollision() {
    if (this.titleCollisionFrame !== null) {
      cancelAnimationFrame(this.titleCollisionFrame);
    }

    this.titleCollisionFrame = requestAnimationFrame(() => {
      this.titleCollisionFrame = null;
      const labels = this.appMenu.getLabels();
      this.appMenu.setOverflowStartIndex(labels.length);
      this.titleElement.style.visibility = "visible";

      const menuElement = this.appMenu.getElement();
      const menuRect = menuElement.getBoundingClientRect();
      const titleRect = this.titleElement.getBoundingClientRect();
      const labelWidths = labels.map((label) => label.getElement().getBoundingClientRect().width);
      const firstLabelRect = labels[0]?.getElement().getBoundingClientRect();
      const leadingWidth = firstLabelRect ? firstLabelRect.left - menuRect.left : 0;
      const configuredGap = Number.parseFloat(
        getComputedStyle(this.element).getPropertyValue("--title-bar-title-gap"),
      );
      const titleGap = Number.isFinite(configuredGap) ? configuredGap : 8;
      const menuOnRight = this.element.classList.contains("theme-macos-tahoe");
      const availableWidth = calculateAvailableMenuWidth(
        menuRect,
        titleRect,
        leadingWidth,
        titleGap,
        menuOnRight,
      );
      const overflowWidth = this.appMenu.measureOverflowLabelWidth();
      const visibleCount = calculateVisibleLabelCount(labelWidths, availableWidth, overflowWidth);

      this.appMenu.setOverflowStartIndex(visibleCount);
      const finalMenuRect = menuElement.getBoundingClientRect();

      if (Utils.domRectIntersects(finalMenuRect, titleRect)) {
        this.titleElement.style.visibility = "hidden";
      }
    });
  }

  deactivate() {
    // Everything scheduled has to be dropped before the pieces it runs against
    // are taken apart -- a pending frame or debounce measures a detached menu
    // and writes overflow state onto a destroyed one.
    this.windowStateSyncGeneration++;
    this.debouncedCheckTitleCollision.cancel();
    this.debouncedWindowStateSync.cancel();
    this.debouncedMenuUpdate.cancel();
    if (this.titleCollisionFrame !== null) {
      cancelAnimationFrame(this.titleCollisionFrame);
      this.titleCollisionFrame = null;
    }

    this.titleObserver?.disconnect();
    this.element.removeEventListener("dblclick", this.handleTitleBarDoubleClick);
    this.detachMenuUpdater();
    this.contextMenuInterceptor.deactivate();
    this.controlTiles.destroy();
    this.appMenu?.destroy();
    this.themeDisposable?.dispose();
    this.element.parentElement?.removeChild(this.element);
    this.submenuPortal.parentElement?.removeChild(this.submenuPortal);

    window.removeEventListener("resize", this.handleWindowResize);
    this.windowSubscriptions?.forEach((subscription) => subscription.dispose());
    this.windowSubscriptions = null;
  }

  // The live settings object, handed to the application menu by reference so a
  // config change reaches it without a broadcast.
  getConfigState() {
    return this.configState;
  }

  getThemeManager() {
    return this.themeManager;
  }

  getElement() {
    return this.element;
  }

  getApplicationMenu() {
    return this.appMenu;
  }

  getContextMenuInterceptor() {
    return this.contextMenuInterceptor;
  }

  getControlTiles() {
    return this.controlTiles;
  }

  updateLaunchMode() {
    const launchMode = resolveLaunchMode({
      devMode: lumine.window.isDevMode(),
      safeMode: lumine.window.isSafeMode(),
      sourceMode: Boolean(process.defaultApp) && !lumine.window.isSpecMode(),
    });

    const modeLabel = launchMode === "source" ? "source mode" : `${launchMode} mode`;
    this.appIcon.title = launchMode ? `Lumine (${modeLabel})` : "Lumine";

    // The icon itself already carries the mode in its color -- no separate
    // dot indicator needed on top of it.
    const iconFile = resolveLaunchIconFile({
      devMode: lumine.window.isDevMode(),
      safeMode: lumine.window.isSafeMode(),
    });
    this.logoImage.src = pathToFileURL(
      path.join(lumine.app.getResourcePath(), "resources", "app-icons", iconFile),
    ).href;
  }

  isTitleBarVisible() {
    return this.titleBarVisible;
  }

  isMenuBarVisible() {
    return this.menuBarVisible;
  }
}

module.exports = {
  TitleBarView,
  calculateAvailableMenuWidth,
  calculateVisibleLabelCount,
  resolveLaunchMode,
  resolveLaunchIconFile,
};
