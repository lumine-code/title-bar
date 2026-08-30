let titleBar;
let surfaceTitleBarFactory;
let contextMenuInterceptor;
let customMenusSubscription;

function getTitleBar() {
  if (!titleBar) {
    const { TitleBar } = require("./replacer.js");
    titleBar = new TitleBar();
  }
  return titleBar;
}

function activate() {
  const { ContextMenuInterceptor } = require("./context-menu-interceptor.js");
  const { SurfaceTitleBarFactory } = require("./surface-title-bar.js");
  contextMenuInterceptor = new ContextMenuInterceptor();
  const activeTitleBar = getTitleBar();
  customMenusSubscription = lumine.config.observe("title-bar.customMenus", (enabled) => {
    const customMenus = enabled !== false;
    activeTitleBar.setCustomMenus(customMenus);
    if (customMenus) contextMenuInterceptor.activate();
    else contextMenuInterceptor.deactivate();
  });
  surfaceTitleBarFactory = new SurfaceTitleBarFactory();
  activeTitleBar.activate();
}

function deactivate() {
  titleBar?.deactivate();
  titleBar = undefined;
  surfaceTitleBarFactory?.destroy();
  surfaceTitleBarFactory = undefined;
  customMenusSubscription?.dispose();
  customMenusSubscription = undefined;
  contextMenuInterceptor?.deactivate();
  contextMenuInterceptor = undefined;
}

function provideTitleBar() {
  return titleBar?.titleBarView?.getControlTiles();
}

function provideSurfaceTitleBar() {
  return surfaceTitleBarFactory;
}

module.exports = {
  activate,
  deactivate,
  provideTitleBar,
  provideSurfaceTitleBar,
};
