const { CompositeDisposable } = require("lumine");
require("./theme.js");
const { TitleBarView } = require("./view.js");
const { Config } = require("./types.js");

class TitleBar {
  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.configState = new Config();
    this.titleBarView = undefined;
    this.titleBarPanel = undefined;
    this.initialized = false;
  }

  activate() {
    this.titleBarView = new TitleBarView(this.configState);
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
          if (this.configState.autoHide) {
            this.titleBarView.setMenuBarVisible(true);
          }
          this.titleBarView.getApplicationMenu().focusMenuCommand();
        },
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("title-bar.autoHide", (value) => {
        this.configState.autoHide = value;
        if (value) {
          this.titleBarView.setMenuBarVisible(false);
        } else {
          this.titleBarView.setMenuBarVisible(true);
        }
      }),
    );
    this.subscriptions.add(
      lumine.config.observe("title-bar.altGivesFocus", (value) => {
        this.configState.altGivesFocus = value;
      }),
    );
    this.subscriptions.add(
      lumine.config.observe("title-bar.controlTheme", (value) => {
        this.configState.windowControlTheme = value;
        this.titleBarView.getThemeManager().setWindowControlTheme(value);
      }),
    );
    this.subscriptions.add(
      lumine.config.observe("title-bar.customContextMenus", (value) => {
        this.configState.customContextMenus = value;
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
