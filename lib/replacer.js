const { CompositeDisposable } = require("lumine");
require("./theme.js");
const { TitleBarView } = require("./view.js");
const { Config } = require("./types.js");

class TitleBar {
  constructor(controlTiles, editorWindow = lumine.workspace.getMainWindow()) {
    this.subscriptions = new CompositeDisposable();
    this.configState = new Config();
    this.controlTiles = controlTiles;
    this.editorWindow = editorWindow;
    this.titleBarView = undefined;
    this.titleBarPanel = undefined;
    this.initialized = false;
  }

  activate() {
    if (this.initialized) return;
    this.configState.autoHide = Boolean(lumine.config.get("title-bar.autoHide"));
    this.configState.altGivesFocus = Boolean(lumine.config.get("title-bar.altGivesFocus"));
    this.configState.windowControlTheme = lumine.config.get("title-bar.controlTheme") || "Default";
    this.titleBarView = new TitleBarView(this.configState, {
      controlTiles: this.controlTiles,
      editorWindow: this.editorWindow,
    });
    this.initSubscriptions();

    this.subscriptions.add(
      this.editorWindow.getEditorContainer().observeActivePane(() => {
        if (!this.initialized) {
          this.titleBarPanel = this.editorWindow.addHeaderPanel({
            item: this.titleBarView.getElement(),
            priority: 0,
          });
          this.initialized = true;
        }
      }),
    );

    if (lumine.window.isDevMode()) {
      this.editorWindow.getDOMWindow().titleBar = this;
    }
  }

  initSubscriptions() {
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
    delete this.editorWindow.getDOMWindow().titleBar;
  }
}

module.exports = { TitleBar };
