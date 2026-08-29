let titleBar;
let surfaceTitleBarFactory;

function getTitleBar() {
  if (!titleBar) {
    const { TitleBar } = require("./replacer.js");
    titleBar = new TitleBar();
  }
  return titleBar;
}

function activate() {
  const { SurfaceTitleBarFactory } = require("./surface-title-bar.js");
  surfaceTitleBarFactory = new SurfaceTitleBarFactory();
  getTitleBar().activate();
}

function deactivate() {
  titleBar?.deactivate();
  titleBar = undefined;
  surfaceTitleBarFactory?.destroy();
  surfaceTitleBarFactory = undefined;
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
