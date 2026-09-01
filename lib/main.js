let titleBar;

function getTitleBar() {
  if (!titleBar) {
    const { TitleBar } = require("./replacer.js");
    titleBar = new TitleBar();
  }
  return titleBar;
}

function activate() {
  getTitleBar().activate();
}

function deactivate() {
  titleBar?.deactivate();
  titleBar = undefined;
}

function provideTitleBar() {
  return titleBar?.titleBarView?.getControlTiles();
}

module.exports = {
  activate,
  deactivate,
  provideTitleBar,
};
