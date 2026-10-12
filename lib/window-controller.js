const { CompositeDisposable } = require("lumine");

function createWindowController(editorWindow) {
  return {
    getState: () => editorWindow.getState(),
    onDidChangeState(callback) {
      return new CompositeDisposable(
        editorWindow.onDidMaximize(() => callback()),
        editorWindow.onDidUnmaximize(() => callback()),
        editorWindow.onDidEnterFullScreen(() => callback()),
        editorWindow.onDidLeaveFullScreen(() => callback()),
      );
    },
    onDidFocus: (callback) => editorWindow.onDidFocus(callback),
    onDidBlur: (callback) => editorWindow.onDidBlur(callback),
    focus: () => editorWindow.focus(),
    minimize: () => editorWindow.minimize(),
    maximize: () => editorWindow.maximize(),
    unmaximize: () => editorWindow.unmaximize(),
    close: () => editorWindow.close(),
    requestClose: () => editorWindow.close(),
    setBounds({ x, y, width, height }) {
      if (editorWindow.setBounds) return editorWindow.setBounds({ x, y, width, height });
      return Promise.all([editorWindow.setPosition(x, y), editorWindow.setSize(width, height)]);
    },
    getDoubleClickAction: () =>
      lumine.application.getUserDefault("AppleActionOnDoubleClick", "string"),
  };
}

module.exports = { createWindowController };
