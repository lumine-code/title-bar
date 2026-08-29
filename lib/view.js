const path = require("path");
const { pathToFileURL } = require("url");
const { ApplicationMenu } = require("./app-menu.js");
const { MenuUpdater } = require("./updater.js");
const { ContextMenuInterceptor } = require("./context-menu-interceptor.js");
const { TitleBarChrome } = require("./title-bar-chrome.js");
const { createPrimaryController } = require("./primary-controller.js");
const { resolveLaunchMode, resolveLaunchIconFile } = require("./launch-mode.js");
const { Utils } = require("./utils.js");

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
  if (totalWidth <= availableWidth) return labelWidths.length;

  let usedWidth = overflowWidth;
  let visibleCount = 0;
  for (const width of labelWidths) {
    if (usedWidth + width > availableWidth) break;
    usedWidth += width;
    visibleCount++;
  }
  return visibleCount;
}

function calculateAvailableMenuWidth(menuRect, titleRect, leadingWidth, titleGap, onTrailingEdge) {
  const availableWidth = onTrailingEdge
    ? menuRect.right - titleRect.right - leadingWidth - titleGap
    : titleRect.left - menuRect.left - leadingWidth - titleGap;
  return Math.max(0, availableWidth);
}

class TitleBarView {
  constructor(configState) {
    this.configState = configState;
    this.document = globalThis.document;
    this.window = this.document.defaultView;
    this.contextMenuInterceptor = new ContextMenuInterceptor(configState);
    this.menuBarVisible = true;
    this.originalMenuUpdateFn = undefined;
    this.titleCollisionFrame = null;
    this.destroyed = false;

    this.debouncedCheckTitleCollision = debounce(() => this.checkTitleCollision(), 150);
    this.debouncedMenuUpdate = debounce(() => this.updateMenuImmediate(), 10);

    const appearance = this.launchAppearance();
    this.chrome = new TitleBarChrome({
      document: this.document,
      controller: createPrimaryController(),
      title: this.document.title || "Lumine",
      onDidActivateAppIcon: () =>
        lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "application:about"),
      logoURL: appearance.url,
      appIconLabel: appearance.label,
      controlTheme: this.configState.windowControlTheme,
      platform: process.platform,
      onDidChangeVisibility: () => this.debouncedCheckTitleCollision(),
    });
    this.element = this.chrome.element;
    this.titleElement = this.chrome.titleElement;
    this.windowControls = this.chrome.windowControls;
    this.appIcon = this.chrome.appIcon;
    this.controlTilesElement = this.chrome.controlTilesElement;
    this.controlTiles = this.chrome.controlTiles;
    this.themeManager = this.chrome.themeManager;

    this.titleObserver = new this.window.MutationObserver(() => this.updateTitleText());
    const realTitle = this.document.querySelector("title");
    if (realTitle) {
      this.titleObserver.observe(realTitle, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    this.appMenu = ApplicationMenu.createApplicationMenu(MenuUpdater.getTemplate(), this);
    this.element.appendChild(this.appMenu.getElement());
    this.updateTitleText();

    this.submenuPortal = this.document.createElement("div");
    this.submenuPortal.classList.add("app-menu-submenu-portal");
    this.document.body.appendChild(this.submenuPortal);
    this.appMenu.setupSubmenuPortals(this.submenuPortal);
    this.attachMenuUpdater();

    this.handleAppIconMouseEnter = () => {
      if (this.configState.autoHide) this.setMenuBarVisible(true);
    };
    this.appIcon.addEventListener("mouseenter", this.handleAppIconMouseEnter);
    this.handleWindowResize = () => this.debouncedCheckTitleCollision();
    this.window.addEventListener("resize", this.handleWindowResize);

    this.menuWindowSubscriptions = [
      lumine.window.onDidBlur(() => this.appMenu?.blur()),
      lumine.window.onDidFocus(() => this.debouncedCheckTitleCollision()),
    ];
    this.themeDisposable = lumine.themes.onDidChangeActiveThemes(() => {
      this.debouncedCheckTitleCollision();
    });

    if (this.configState.customContextMenus) this.contextMenuInterceptor.activate();
  }

  launchAppearance() {
    const devMode = lumine.window.isDevMode();
    const safeMode = lumine.window.isSafeMode();
    const launchMode = resolveLaunchMode({
      devMode,
      safeMode,
      sourceMode: Boolean(process.defaultApp) && !lumine.window.isSpecMode(),
    });
    const modeLabel = launchMode === "source" ? "source mode" : `${launchMode} mode`;
    const label = launchMode ? `Lumine (${modeLabel})` : "Lumine";
    const iconFile = resolveLaunchIconFile({ devMode, safeMode });
    const url = pathToFileURL(
      path.join(lumine.application.getResourcePath(), "resources", "app-icons", iconFile),
    ).href;
    return { label, url };
  }

  attachMenuUpdater() {
    this.hadOwnMenuUpdate = Object.hasOwn(lumine.menu, "update");
    this.originalMenuUpdateFn = lumine.menu.update;
    lumine.menu.update = (...args) => {
      this.originalMenuUpdateFn?.apply(lumine.menu, args);
      this.debouncedMenuUpdate();
    };
  }

  detachMenuUpdater() {
    if (this.originalMenuUpdateFn === undefined) return;
    if (this.hadOwnMenuUpdate) lumine.menu.update = this.originalMenuUpdateFn;
    else delete lumine.menu.update;
    this.originalMenuUpdateFn = undefined;
  }

  updateMenuImmediate() {
    const edits = MenuUpdater.run(this.appMenu);
    if (edits > 0) {
      this.appMenu.setupSubmenuPortals(this.submenuPortal);
      this.debouncedCheckTitleCollision();
    }
  }

  setTitleBarVisible(visible) {
    this.chrome.setTitleBarVisible(visible);
    this.debouncedCheckTitleCollision();
  }

  setMenuBarVisible(visible) {
    this.menuBarVisible = visible;
    Utils.setToggleClass(this.appMenu.getElement(), "no-menu-bar", !visible);
  }

  updateTitleText() {
    const realTitle = this.document.querySelector("title");
    if (!realTitle) return;
    this.chrome.setTitle(realTitle.textContent || "Lumine");
    this.debouncedCheckTitleCollision();
  }

  checkTitleCollision() {
    if (this.destroyed || !this.appMenu) return;
    if (this.titleCollisionFrame !== null) {
      this.window.cancelAnimationFrame(this.titleCollisionFrame);
    }

    this.titleCollisionFrame = this.window.requestAnimationFrame(() => {
      this.titleCollisionFrame = null;
      if (this.destroyed) return;
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
        this.window.getComputedStyle(this.element).getPropertyValue("--title-bar-title-gap"),
      );
      const titleGap = Number.isFinite(configuredGap) ? configuredGap : 8;
      const availableWidth = calculateAvailableMenuWidth(
        menuRect,
        titleRect,
        leadingWidth,
        titleGap,
        this.themeManager.isMenuOnTrailingEdge(),
      );
      const visibleCount = calculateVisibleLabelCount(
        labelWidths,
        availableWidth,
        this.appMenu.measureOverflowLabelWidth(),
      );
      this.appMenu.setOverflowStartIndex(visibleCount);
      if (Utils.domRectIntersects(menuElement.getBoundingClientRect(), titleRect)) {
        this.titleElement.style.visibility = "hidden";
      }
    });
  }

  deactivate() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.debouncedCheckTitleCollision.cancel();
    this.debouncedMenuUpdate.cancel();
    if (this.titleCollisionFrame !== null) {
      this.window.cancelAnimationFrame(this.titleCollisionFrame);
      this.titleCollisionFrame = null;
    }
    this.titleObserver?.disconnect();
    this.detachMenuUpdater();
    this.contextMenuInterceptor.deactivate();
    this.appMenu?.destroy();
    this.appMenu = null;
    this.themeDisposable?.dispose();
    this.themeDisposable = null;
    this.appIcon.removeEventListener("mouseenter", this.handleAppIconMouseEnter);
    this.window.removeEventListener("resize", this.handleWindowResize);
    this.menuWindowSubscriptions?.forEach((subscription) => subscription.dispose());
    this.menuWindowSubscriptions = null;
    this.submenuPortal?.remove();
    this.submenuPortal = null;
    this.chrome.destroy();
  }

  getConfigState() {
    return this.configState;
  }

  getThemeManager() {
    return this.chrome.getThemeManager();
  }

  getElement() {
    return this.chrome.getElement();
  }

  getApplicationMenu() {
    return this.appMenu;
  }

  getContextMenuInterceptor() {
    return this.contextMenuInterceptor;
  }

  getControlTiles() {
    return this.chrome.getControlTiles();
  }

  updateLaunchMode() {
    this.chrome.setLogo(this.launchAppearance());
  }

  isTitleBarVisible() {
    return this.chrome.isTitleBarVisible();
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
