const path = require("path");
const { pathToFileURL } = require("url");
const { TitleBarChrome } = require("./title-bar-chrome.js");
const { resolveLaunchMode, resolveLaunchIconFile } = require("./launch-mode.js");

function launchAppearance() {
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

class SurfaceTitleBarFactory {
  constructor() {
    this.instances = new Set();
    this.destroyed = false;
    this.controlTheme = "Default";
    this.configDisposable = lumine.config.observe("title-bar.controlTheme", (theme) => {
      this.controlTheme = theme;
      for (const record of this.instances) record.chrome.setWindowControlTheme(theme);
    });
  }

  create({ document, controller, title = "Lumine", actions = [], onDidActivateAppIcon } = {}) {
    if (this.destroyed) throw new Error("The surface title-bar factory has been destroyed");
    if (!document?.defaultView) throw new TypeError("A surface title bar requires a live Document");
    if (!controller || typeof controller !== "object") {
      throw new TypeError("A surface title bar requires a controller");
    }
    if (!Array.isArray(actions)) throw new TypeError("Surface title-bar actions must be an array");
    const appearance = launchAppearance();
    const chrome = new TitleBarChrome({
      document,
      controller,
      title,
      actions,
      onDidActivateAppIcon,
      logoURL: appearance.url,
      appIconLabel: appearance.label,
      controlTheme: this.controlTheme,
      platform: process.platform,
    });
    chrome.element.classList.add("surface-title-bar");
    const record = { chrome, destroyed: false };
    const handle = {
      element: chrome.element,
      setTitle(nextTitle) {
        if (!record.destroyed) chrome.setTitle(nextTitle);
      },
      destroy: () => this.destroyRecord(record),
    };
    record.handle = handle;
    this.instances.add(record);
    return handle;
  }

  destroyRecord(record) {
    if (record.destroyed) return;
    record.destroyed = true;
    this.instances.delete(record);
    record.chrome.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.configDisposable?.dispose();
    this.configDisposable = null;
    for (const record of Array.from(this.instances)) this.destroyRecord(record);
  }
}

module.exports = { SurfaceTitleBarFactory, launchAppearance };
