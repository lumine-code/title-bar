const { ControlTiles } = require("./control-tiles.js");
const { ThemeManager } = require("./theme.js");

const MAXIMIZE_ICON =
  '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
const RESTORE_ICON =
  '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/><path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" stroke-width="1"/></svg>';

function activate(callback, event) {
  if (!callback) return;
  try {
    const result = callback(event);
    if (result?.catch) result.catch((error) => console.error(error));
  } catch (error) {
    console.error(error);
  }
}

function bindActivation(element, callback) {
  if (!callback) return () => {};
  const click = (event) => activate(callback, event);
  const keydown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate(callback, event);
  };
  element.addEventListener("click", click);
  element.addEventListener("keydown", keydown);
  return () => {
    element.removeEventListener("click", click);
    element.removeEventListener("keydown", keydown);
  };
}

function bindClick(element, callback) {
  const click = (event) => activate(callback, event);
  element.addEventListener("click", click);
  return () => element.removeEventListener("click", click);
}

function normalizeState(state = {}) {
  return {
    fullscreen: Boolean(state.fullscreen ?? state.fullScreen),
    maximized: Boolean(state.maximized),
    visible: Boolean(state.visible),
    bounds:
      state.bounds ||
      (state.position && state.size ? { ...state.position, ...state.size } : undefined),
  };
}

class TitleBarChrome {
  constructor({
    controller,
    title = "Lumine",
    onDidActivateAppIcon,
    logoURL = "",
    appIconLabel = "Lumine",
    controlTheme = "Default",
    platform = process.platform,
    controlTiles,
    onDidChangeVisibility,
  }) {
    if (!controller || typeof controller !== "object") {
      throw new TypeError("TitleBarChrome requires a window controller");
    }
    this.controller = controller;
    this.platform = platform;
    this.onDidChangeVisibility = onDidChangeVisibility;
    this.destroyed = false;
    this.titleBarVisible = true;
    this.windowState = normalizeState();
    this.windowStateSyncGeneration = 0;
    this.restoreBounds = null;
    this.disposables = [];
    this.actionCleanups = [];
    this.controlTiles = controlTiles;

    this.createElement({ title, onDidActivateAppIcon, logoURL, appIconLabel });
    this.controlTiles ||= new ControlTiles(this.controlTilesElement);
    this.themeManager = new ThemeManager(this);
    this.themeManager.setWindowControlTheme(controlTheme);
    this.bindWindowControls();
    this.bindController();
    this.handleDoubleClick = (event) => activate(() => this.didDoubleClick(event), event);
    this.element.addEventListener("dblclick", this.handleDoubleClick);
    void this.syncWindowState();
  }

  createElement({ title, onDidActivateAppIcon, logoURL, appIconLabel }) {
    this.element = document.createElement("div");
    this.element.classList.add("title-bar");

    this.appIcon = document.createElement("div");
    this.appIcon.classList.add("app-icon");
    this.logoImage = document.createElement("img");
    this.logoImage.width = 24;
    this.logoImage.height = 24;
    this.logoImage.alt = "";
    this.logoImage.setAttribute("aria-hidden", "true");
    this.logoImage.setAttribute("draggable", "false");
    if (logoURL) this.logoImage.src = logoURL;
    this.appIcon.appendChild(this.logoImage);
    if (onDidActivateAppIcon) {
      this.appIcon.setAttribute("role", "button");
      this.appIcon.setAttribute("aria-label", appIconLabel);
      this.appIcon.tabIndex = 0;
      this.actionCleanups.push(bindActivation(this.appIcon, onDidActivateAppIcon));
    } else {
      this.appIcon.setAttribute("aria-hidden", "true");
    }
    this.element.appendChild(this.appIcon);

    this.titleElement = document.createElement("span");
    this.titleElement.classList.add("custom-title");
    this.setTitle(title);
    this.element.appendChild(this.titleElement);

    this.controlTilesElement = this.controlTiles?.element || document.createElement("div");
    this.controlTilesElement.classList.add("control-tiles");
    this.element.appendChild(this.controlTilesElement);

    this.windowButtonsElement = document.createElement("div");
    this.windowButtonsElement.classList.add("window-buttons");
    this.windowControls = {
      minimize: this.createWindowButton(
        "minimize",
        "Minimize window",
        '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1"/></svg>',
      ),
      maximize: this.createWindowButton("maximize", "Maximize window", MAXIMIZE_ICON),
      close: this.createWindowButton(
        "close",
        "Close window",
        '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1"/></svg>',
      ),
    };
    this.windowButtonsElement.append(
      this.windowControls.minimize,
      this.windowControls.maximize,
      this.windowControls.close,
    );
    this.element.appendChild(this.windowButtonsElement);
  }

  createWindowButton(name, label, icon) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add(`btn-${name}`);
    button.setAttribute("aria-label", label);
    button.innerHTML = icon;
    return button;
  }

  bindWindowControls() {
    this.actionCleanups.push(
      bindClick(this.windowControls.minimize, () => this.controller.minimize?.()),
      bindClick(this.windowControls.maximize, () => this.toggleMaximized()),
      bindClick(this.windowControls.close, () =>
        (this.controller.requestClose || this.controller.close)?.call(this.controller),
      ),
    );
  }

  bindController() {
    const subscribe = (method, callback) => {
      if (typeof this.controller[method] !== "function") return;
      const disposable = this.controller[method](callback);
      if (disposable?.dispose) this.disposables.push(disposable);
    };
    subscribe("onDidChangeState", (state) => {
      if (state) this.applyWindowState(state);
      else void this.syncWindowState();
    });
    subscribe("onDidFocus", () => {
      this.element.classList.remove("is-window-blurred");
      void this.syncWindowState();
    });
    subscribe("onDidBlur", () => this.element.classList.add("is-window-blurred"));
  }

  async readWindowState() {
    return normalizeState(await this.controller.getState?.());
  }

  async syncWindowState() {
    const generation = ++this.windowStateSyncGeneration;
    try {
      const state = await this.readWindowState();
      if (this.destroyed || generation !== this.windowStateSyncGeneration) return;
      this.applyWindowState(state);
    } catch (error) {
      if (!this.destroyed && generation === this.windowStateSyncGeneration) console.error(error);
    }
  }

  applyWindowState(state) {
    this.windowState = normalizeState(state);
    this.updateMaximizeControl();
    this.updateFullscreenState();
  }

  updateMaximizeControl() {
    this.windowControls.maximize.innerHTML = this.windowState.maximized
      ? RESTORE_ICON
      : MAXIMIZE_ICON;
    const label = this.windowState.maximized ? "Restore window" : "Maximize window";
    this.windowControls.maximize.setAttribute("aria-label", label);
  }

  updateFullscreenState() {
    this.windowControls.maximize.classList.toggle("disabled", this.windowState.fullscreen);
    this.setTitleBarVisible(!this.windowState.fullscreen || this.platform === "darwin");
  }

  async toggleMaximized() {
    if (this.windowState.fullscreen) return;
    const current = await this.readWindowState();
    if (current.maximized) {
      await this.controller.unmaximize?.();
      if (this.restoreBounds && this.controller.setBounds) {
        await this.controller.setBounds(this.restoreBounds);
      }
      this.restoreBounds = null;
      this.windowState.maximized = false;
    } else {
      this.restoreBounds = current.bounds || null;
      await this.controller.maximize?.();
      this.windowState.maximized = true;
    }
    this.updateMaximizeControl();
  }

  async didDoubleClick(event) {
    if (
      event.target.closest?.(
        ".app-icon, .title-bar-menu-bar, .control-tiles, .window-buttons, button, input, select",
      )
    ) {
      return;
    }
    if (this.platform === "darwin" && this.controller.getDoubleClickAction) {
      const action = await this.controller.getDoubleClickAction();
      if (action === "Minimize") return this.controller.minimize?.();
      if (action && action !== "Maximize") return;
    }
    return this.toggleMaximized();
  }

  setTitle(title) {
    this.titleElement.textContent = title || "Lumine";
  }

  setLogo({ url, label }) {
    if (url) this.logoImage.src = url;
    if (label) {
      if (this.appIcon.hasAttribute("aria-label")) this.appIcon.setAttribute("aria-label", label);
    }
  }

  setWindowControlTheme(theme) {
    this.themeManager.setWindowControlTheme(theme);
  }

  setTitleBarVisible(visible) {
    if (this.titleBarVisible === visible) return;
    this.titleBarVisible = visible;
    this.element.classList.toggle("no-title-bar", !visible);
    this.onDidChangeVisibility?.(visible);
  }

  isTitleBarVisible() {
    return this.titleBarVisible;
  }

  getElement() {
    return this.element;
  }

  getThemeManager() {
    return this.themeManager;
  }

  getControlTiles() {
    return this.controlTiles;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.windowStateSyncGeneration++;
    this.element.removeEventListener("dblclick", this.handleDoubleClick);
    for (const cleanup of this.actionCleanups.splice(0)) cleanup();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
    this.controlTiles.destroy();
    this.element.remove();
  }
}

module.exports = { TitleBarChrome, normalizeState, bindActivation };
