let titleBar;
let surfaceTitleBarFactory;
let contextMenuInterceptor;
let contextMenuConfigSubscription;

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
  contextMenuConfigSubscription = lumine.config.observe(
    "title-bar.customContextMenus",
    (enabled) => {
      if (enabled) contextMenuInterceptor.activate();
      else contextMenuInterceptor.deactivate();
    },
  );
  surfaceTitleBarFactory = new SurfaceTitleBarFactory();
  getTitleBar().activate();
}

function deactivate() {
  titleBar?.deactivate();
  titleBar = undefined;
  surfaceTitleBarFactory?.destroy();
  surfaceTitleBarFactory = undefined;
  contextMenuConfigSubscription?.dispose();
  contextMenuConfigSubscription = undefined;
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
