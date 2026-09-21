let titleBar;
let activationGeneration = 0;

function getTitleBar() {
  if (!titleBar) {
    const { TitleBar } = require("./replacer.js");
    titleBar = new TitleBar();
  }
  return titleBar;
}

function activate() {
  const generation = ++activationGeneration;
  // Building the custom chrome imports the menu controller, window controller
  // and theme machinery. The package has no synchronous service dependency,
  // so let the activation batch finish and mount it in the next microtask.
  queueMicrotask(() => {
    if (generation === activationGeneration) getTitleBar().activate();
  });
}

function deactivate() {
  activationGeneration++;
  titleBar?.deactivate();
  titleBar = undefined;
}

function provideTitleBar() {
  return getTitleBar().titleBarView?.getControlTiles();
}

module.exports = {
  activate,
  deactivate,
  provideTitleBar,
};
