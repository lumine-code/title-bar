const { CompositeDisposable } = require("lumine");

function createPrimaryController() {
  return {
    getState: () => lumine.window.getState(),
    onDidChangeState(callback) {
      return new CompositeDisposable(
        lumine.window.onDidMaximize(() => callback()),
        lumine.window.onDidUnmaximize(() => callback()),
        lumine.window.onDidEnterFullScreen(() => callback()),
        lumine.window.onDidLeaveFullScreen(() => callback()),
      );
    },
    onDidFocus: (callback) => lumine.window.onDidFocus(callback),
    onDidBlur: (callback) => lumine.window.onDidBlur(callback),
    focus: () => lumine.window.focus(),
    minimize: () => lumine.window.minimize(),
    maximize: () => lumine.window.maximize(),
    unmaximize: () => lumine.window.unmaximize(),
    close: () => lumine.window.close(),
    requestClose: () => lumine.window.close(),
    setBounds({ x, y, width, height }) {
      return Promise.all([lumine.window.setPosition(x, y), lumine.window.setSize(width, height)]);
    },
    getDoubleClickAction: () =>
      lumine.application.getUserDefault("AppleActionOnDoubleClick", "string"),
  };
}

module.exports = { createPrimaryController };
