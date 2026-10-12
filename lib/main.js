const { ControlTiles } = require("./control-tiles.js");
const { CompositeDisposable, WindowContributionRegistry } = require("lumine");

let hosts;
let contributions;
let subscriptions;
let activationGeneration = 0;

function getHost(window = lumine.workspace.getMainWindow()) {
  if (!hosts || !lumine.workspace.getWindows().includes(window) || window.isDestroyed())
    throw new Error("The title bar requires a live window of this workspace.");
  let host = hosts.get(window);
  if (!host) {
    // Services are published during the synchronous activation bootstrap. Keep
    // their host detached until the deferred chrome mount adopts it.
    const element = (window.getDocument() ?? document).createElement("div");
    element.classList.add("control-tiles");
    host = { window, controlTiles: new ControlTiles(element), titleBar: null };
    hosts.set(window, host);
  }
  return host;
}

function getTitleBar(window = lumine.workspace.getMainWindow()) {
  const host = getHost(window);
  if (!host.titleBar) {
    const { TitleBar } = require("./replacer.js");
    host.titleBar = new TitleBar(host.controlTiles, window);
  }
  return host.titleBar;
}

function ensureTitleBar(window) {
  const titleBar = getTitleBar(window);
  titleBar.activate();
  return titleBar;
}

function activate() {
  const generation = ++activationGeneration;
  hosts = new Map();
  subscriptions = new CompositeDisposable();
  contributions = new WindowContributionRegistry({
    workspace: lumine.workspace,
    mount: (window, options) => getHost(window).controlTiles.addItem(options),
  });
  subscriptions.add(contributions);
  subscriptions.add(
    lumine.commands.add("lumine-workspace", {
      "title-bar:toggle": (event) => {
        const view = ensureTitleBar(
          event.context?.window ?? lumine.workspace.getMainWindow(),
        ).titleBarView;
        view.setTitleBarVisible(!view.isTitleBarVisible());
      },
      "title-bar:focus-menu": {
        description: "Move focus to the window's own menu bar.",
        didDispatch: (event) =>
          ensureTitleBar(
            event.context?.window ?? lumine.workspace.getMainWindow(),
          ).titleBarView.focusMenu(),
      },
      "window:toggle-menu-bar": {
        description: "Toggle whether the window menu bar is hidden automatically.",
        didDispatch: () => {
          if (process.platform !== "darwin")
            lumine.config.set("title-bar.autoHide", !lumine.config.get("title-bar.autoHide"));
        },
      },
    }),
  );
  if (process.platform !== "darwin")
    subscriptions.add(
      lumine.menu.add([
        {
          label: "View",
          submenu: [{ label: "Toggle Menu Bar", command: "window:toggle-menu-bar" }],
        },
        {
          label: "Packages",
          submenu: [
            {
              label: "Title Bar",
              submenu: [{ label: "Toggle Menu Bar", command: "window:toggle-menu-bar" }],
            },
          ],
        },
      ]),
    );
  // Building the custom chrome imports the menu controller, window controller
  // and theme machinery. The package has no synchronous service dependency,
  // so let the activation batch finish and mount it in the next microtask.
  subscriptions.add(
    lumine.workspace.observeWindows((window) => {
      getHost(window);
      subscriptions.add(window.onWillDestroy(() => releaseWindow(window)));
      queueMicrotask(() => {
        if (generation === activationGeneration && !window.isDestroyed())
          getTitleBar(window).activate();
      });
    }),
  );
}

function releaseWindow(window) {
  const host = hosts?.get(window);
  if (!host) return;
  hosts.delete(window);
  host.titleBar?.deactivate();
  host.controlTiles.destroy();
}

function deactivate() {
  activationGeneration++;
  subscriptions?.dispose();
  for (const window of [...(hosts?.keys() ?? [])]) releaseWindow(window);
  hosts = null;
  contributions = null;
  subscriptions = null;
}

function provideTitleBar() {
  const registry = contributions;
  const collection = (window) => {
    if (registry.disposed) throw new Error("The title bar service has been disposed.");
    return getHost(window).controlTiles;
  };
  return {
    addItem: (options) => registry.add(options),
    getTiles: (window = lumine.workspace.getMainWindow()) => collection(window).getTiles(),
    forWindow: collection,
    observeWindows: (callback, { windows = "main" } = {}) =>
      registry.observe({
        windows,
        create: (context) => callback(collection(context.window), context),
      }),
  };
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
