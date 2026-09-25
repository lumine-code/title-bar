const { CompositeDisposable } = require("lumine");
require("./theme.js");
const { TitleBarView } = require("./view.js");
const { Config } = require("./types.js");

class TitleBar {
  constructor(controlTiles) {
    this.subscriptions = new CompositeDisposable();
    this.configState = new Config();
    this.controlTiles = controlTiles;
    this.titleBarView = undefined;
    this.titleBarPanel = undefined;
    this.initialized = false;
  }

  activate() {
    this.configState.autoHide = Boolean(lumine.config.get("title-bar.autoHide"));
    this.configState.altGivesFocus = Boolean(lumine.config.get("title-bar.altGivesFocus"));
    this.configState.windowControlTheme = lumine.config.get("title-bar.controlTheme") || "Default";
    this.titleBarView = new TitleBarView(this.configState, { controlTiles: this.controlTiles });
    this.initSubscriptions();

    this.subscriptions.add(
      lumine.workspace.observeActivePane(() => {
        if (!this.initialized) {
          this.titleBarPanel = lumine.workspace.addHeaderPanel({
            item: this.titleBarView.getElement(),
            priority: 0,
          });
          this.initialized = true;
        }
      }),
    );

    if (lumine.window.isDevMode()) {
      window.titleBar = this;
    }
  }

  initSubscriptions() {
    if (process.platform !== "darwin") {
      this.subscriptions.add(
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
    }
    this.subscriptions.add(
      lumine.commands.add("lumine-workspace", {
        "title-bar:toggle": () => {
          const visible = this.titleBarView.isTitleBarVisible();
          this.titleBarView.setTitleBarVisible(!visible);
        },
        "title-bar:focus-menu": {
          description: "Move focus to the window's own menu bar.",
          didDispatch: () => this.titleBarView.focusMenu(),
        },
        "window:toggle-menu-bar": {
          description: "Toggle whether the window menu bar is hidden automatically.",
          didDispatch: () => {
            if (process.platform === "darwin") return;
            lumine.config.set("title-bar.autoHide", !this.configState.autoHide);
          },
        },
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("title-bar.autoHide", (value) => {
        this.titleBarView.setAutoHide(value);
      }),
    );
    this.subscriptions.add(
      lumine.config.observe("title-bar.altGivesFocus", (value) => {
        this.titleBarView.setAltGivesFocus(value);
      }),
    );
    this.subscriptions.add(
      lumine.config.observe("title-bar.controlTheme", (value) => {
        this.configState.windowControlTheme = value;
        this.titleBarView.getThemeManager().setWindowControlTheme(value);
      }),
    );
  }

  deactivate() {
    this.subscriptions?.dispose();
    this.titleBarView?.deactivate();
    this.titleBarView = undefined;
    this.titleBarPanel?.destroy();
    this.titleBarPanel = undefined;
    this.initialized = false;
    delete window.titleBar;
  }
}

module.exports = { TitleBar };
