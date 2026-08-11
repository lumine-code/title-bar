const { CompositeDisposable } = require("lumine");
require("./theme.js");
const { TitleBarView } = require("./view.js");
const { Config } = require("./types.js");

class TitleBar {
  static configState = new Config();

  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.titleBarView = undefined;
    this.titleBarPanel = undefined;
    this.initialized = false;
  }

  activate() {
    this.titleBarView = new TitleBarView(TitleBar.configState);
    this.initSubscriptions();

    this.subscriptions.add(
      lumine.workspace.observeActivePane(() => {
        if (!this.initialized) {
          this.titleBarPanel = lumine.workspace.addHeaderPanel({
            item: this.titleBarView.getElement(),
            priority: 0,
          });
          this.titleBarView.updateTransforms();
          this.initialized = true;
        }
      }),
    );

    if (lumine.window.isDevMode()) {
      window.titleBar = this;
    }
  }

  initSubscriptions() {
    this.subscriptions.add(
      lumine.commands.add("lumine-workspace", {
        "title-bar:toggle": () => {
          const visible = this.titleBarView.isTitleBarVisible();
          this.titleBarView.setTitleBarVisible(!visible);
        },
        "title-bar:focus-menu": () => {
          if (TitleBar.configState.autoHide) {
            this.titleBarView.setMenuBarVisible(true);
          }
          this.titleBarView.getApplicationMenu().focusMenuCommand();
        },
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("title-bar.autoHide", (value) => {
        TitleBar.configState.autoHide = value;
        if (value) {
          this.titleBarView.setMenuBarVisible(false);
        } else {
          this.titleBarView.setMenuBarVisible(true);
        }
      }),
    );
    this.subscriptions.add(
      lumine.config.observe("title-bar.altGivesFocus", (value) => {
        TitleBar.configState.altGivesFocus = value;
      }),
    );
    this.subscriptions.add(
      lumine.config.observe("title-bar.controlTheme", (value) => {
        TitleBar.configState.windowControlTheme = value;
        this.titleBarView.getThemeManager().setWindowControlTheme(value);
      }),
    );
    this.subscriptions.add(
      lumine.config.observe("title-bar.customContextMenus", (value) => {
        TitleBar.configState.customContextMenus = value;
        const interceptor = this.titleBarView.getContextMenuInterceptor();
        if (value) {
          interceptor.activate();
        } else {
          interceptor.deactivate();
        }
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
