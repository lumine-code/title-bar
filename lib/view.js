const path = require("path");
const { pathToFileURL } = require("url");
const { TitleBarChrome } = require("./title-bar-chrome.js");
const { createPrimaryController } = require("./primary-controller.js");
const { resolveLaunchMode, resolveLaunchIconFile } = require("./launch-mode.js");

function calculateAvailableMenuWidth(menuRect, titleRect, titleGap, onTrailingEdge) {
  const availableWidth = onTrailingEdge
    ? menuRect.right - titleRect.right - titleGap
    : titleRect.left - menuRect.left - titleGap;
  return Math.max(0, Math.floor(availableWidth));
}

function rectanglesIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

class TitleBarView {
  constructor(configState, { platform = process.platform } = {}) {
    this.configState = configState;
    this.platform = platform;
    this.destroyed = false;
    this.layoutFrame = null;
    this.lastSheetOffset = null;

    const appearance = this.launchAppearance();
    this.chrome = new TitleBarChrome({
      controller: createPrimaryController(),
      title: document.title || "Lumine",
      onDidActivateAppIcon: () =>
        lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "application:about"),
      logoURL: appearance.url,
      appIconLabel: appearance.label,
      controlTheme: this.configState.windowControlTheme,
      platform: this.platform,
      onDidChangeVisibility: () => {
        this.scheduleLayout();
        this.updateSheetOffset();
      },
    });
    this.element = this.chrome.element;
    this.titleElement = this.chrome.titleElement;
    this.windowControls = this.chrome.windowControls;
    this.appIcon = this.chrome.appIcon;
    this.controlTilesElement = this.chrome.controlTilesElement;
    this.controlTiles = this.chrome.controlTiles;
    this.themeManager = this.chrome.themeManager;

    this.menuBar = this.createMenuBar();
    this.handleAppIconMouseEnter = () => {
      if (this.configState.autoHide) this.menuBar?.reveal();
    };
    this.appIcon.addEventListener("mouseenter", this.handleAppIconMouseEnter);
    this.updateTitleText();

    this.titleObserver = new MutationObserver(() => this.updateTitleText());
    const realTitle = document.querySelector("title");
    if (realTitle) {
      this.titleObserver.observe(realTitle, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    this.handleWindowResize = () => this.scheduleLayout();
    window.addEventListener("resize", this.handleWindowResize);

    this.resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            this.scheduleLayout();
            this.updateSheetOffset();
          })
        : null;
    this.resizeObserver?.observe(this.element);

    this.windowSubscriptions = [
      lumine.window.onDidBlur(() => this.menuBar?.blur()),
      lumine.window.onDidFocus(() => {
        this.scheduleLayout();
        this.updateSheetOffset();
      }),
      lumine.workspace.onDidChangeActivePaneItem(() => this.menuBar?.blur()),
    ];
    this.themeDisposable = lumine.themes.onDidChangeActiveThemes(() => {
      this.scheduleLayout();
      this.updateSheetOffset();
    });

    this.scheduleLayout();
    this.updateSheetOffset();
  }

  createMenuBar() {
    if (this.platform === "darwin") return null;
    const menuBar = lumine.menu.createMenuBar({
      autoHide: this.configState.autoHide,
      altGivesFocus: this.configState.altGivesFocus,
    });
    menuBar.element.classList.add("title-bar-menu-bar");
    this.element.appendChild(menuBar.element);
    return menuBar;
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

  scheduleLayout() {
    if (this.destroyed || this.layoutFrame !== null) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.layout();
    });
  }

  layout() {
    if (this.destroyed) return;
    this.titleElement.style.visibility = "visible";
    if (!this.menuBar) return;

    const menuElement = this.menuBar.element;
    const menuRect = menuElement.getBoundingClientRect();
    const titleRect = this.titleElement.getBoundingClientRect();
    const configuredGap = Number.parseFloat(
      getComputedStyle(this.element).getPropertyValue("--title-bar-title-gap"),
    );
    const titleGap = Number.isFinite(configuredGap) ? configuredGap : 8;
    const availableWidth = calculateAvailableMenuWidth(
      menuRect,
      titleRect,
      titleGap,
      this.themeManager.isMenuOnTrailingEdge(),
    );

    this.menuBar.layout(availableWidth);
    this.titleElement.style.visibility = rectanglesIntersect(
      menuElement.getBoundingClientRect(),
      titleRect,
    )
      ? "hidden"
      : "visible";
  }

  updateSheetOffset({ force = false } = {}) {
    if (this.platform !== "darwin" || typeof lumine.window.setSheetOffset !== "function") return;
    const height = this.chrome.isTitleBarVisible()
      ? Math.max(0, Math.round(this.element.getBoundingClientRect().height))
      : 0;
    if (!force && height === this.lastSheetOffset) return;
    this.lastSheetOffset = height;
    try {
      const result = lumine.window.setSheetOffset(height);
      result?.catch?.((error) => console.error(error));
    } catch (error) {
      console.error(error);
    }
  }

  setTitleBarVisible(visible) {
    this.chrome.setTitleBarVisible(visible);
    this.scheduleLayout();
    this.updateSheetOffset();
  }

  setAutoHide(value) {
    this.configState.autoHide = Boolean(value);
    this.menuBar?.setAutoHide(this.configState.autoHide);
    this.scheduleLayout();
  }

  setAltGivesFocus(value) {
    this.configState.altGivesFocus = Boolean(value);
    this.menuBar?.setAltGivesFocus(this.configState.altGivesFocus);
  }

  focusMenu() {
    return this.menuBar?.focus();
  }

  updateTitleText() {
    const realTitle = document.querySelector("title");
    if (!realTitle) return;
    this.chrome.setTitle(realTitle.textContent || "Lumine");
    this.scheduleLayout();
  }

  resetSheetOffset() {
    if (this.platform !== "darwin" || typeof lumine.window.setSheetOffset !== "function") return;
    this.lastSheetOffset = 0;
    try {
      const result = lumine.window.setSheetOffset(0);
      result?.catch?.((error) => console.error(error));
    } catch (error) {
      console.error(error);
    }
  }

  deactivate() {
    if (this.destroyed) return;
    this.resetSheetOffset();
    this.destroyed = true;
    if (this.layoutFrame !== null) {
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
    }
    this.titleObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener("resize", this.handleWindowResize);
    this.windowSubscriptions?.forEach((subscription) => subscription.dispose());
    this.windowSubscriptions = null;
    this.themeDisposable?.dispose();
    this.themeDisposable = null;
    this.appIcon.removeEventListener("mouseenter", this.handleAppIconMouseEnter);
    this.menuBar?.destroy();
    this.menuBar = null;
    this.chrome.destroy();
  }

  getConfigState() {
    return this.configState;
  }

  getThemeManager() {
    return this.chrome.getThemeManager();
  }

  getPlatform() {
    return this.platform;
  }

  getElement() {
    return this.chrome.getElement();
  }

  getMenuBar() {
    return this.menuBar;
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
}

module.exports = {
  TitleBarView,
  calculateAvailableMenuWidth,
  rectanglesIntersect,
  resolveLaunchMode,
  resolveLaunchIconFile,
};
