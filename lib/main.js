const { ControlTiles } = require("./control-tiles.js");

let titleBar;
let controlTiles;
let activationGeneration = 0;

function getControlTiles() {
  if (!controlTiles) {
    // Services are published during the synchronous activation bootstrap. Keep
    // their host detached until the deferred chrome mount adopts it.
    const element = document.createElement("div");
    element.classList.add("control-tiles");
    controlTiles = new ControlTiles(element);
  }
  return controlTiles;
}

function getTitleBar() {
  if (!titleBar) {
    const { TitleBar } = require("./replacer.js");
    titleBar = new TitleBar(getControlTiles());
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
  controlTiles?.destroy();
  titleBar = undefined;
  controlTiles = undefined;
}

function provideTitleBar() {
  return getControlTiles();
}

module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "title-bar",
      tips: [
        "{% if platform != 'darwin' %}{% if keys['title-bar:focus-menu'] %}You can put the keyboard into the application menu with {{ 'title-bar:focus-menu' | keystroke }}{% else %}You can put the keyboard into the application menu by tapping Alt, then reach any item by its underlined letter.{% endif %}{% endif %}",
      ],
    };
  },

  activate,
  deactivate,
  provideTitleBar,
};
