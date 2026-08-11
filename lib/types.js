// The live values of the package's four settings. One object, handed to
// everything that reads them and written by the config observers in
// `replacer.js`, so a change reaches every holder without a broadcast.
class Config {
  constructor() {
    this.autoHide = false;
    this.altGivesFocus = false;
    this.windowControlTheme = "Default";
    this.customContextMenus = true;
  }
}

const controlThemes = {
  "Windows 11": {
    cssClass: "theme-windows-11",
    reverseControls: false,
  },
  "macOS Tahoe": {
    cssClass: "theme-macos-tahoe",
    reverseControls: true,
  },
  GNOME: {
    cssClass: "theme-gnome",
    reverseControls: false,
  },
};

function resolveDefaultControlTheme() {
  switch (process.platform) {
    case "darwin":
      return "macOS Tahoe";
    case "linux":
      return "GNOME";
    default:
      return "Windows 11";
  }
}

function resolveControlTheme(theme) {
  return theme === "Default" ? resolveDefaultControlTheme() : theme;
}

const exceptionCommands = new Set([
  "application:open-terms-of-use",
  "application:open-documentation",
  "application:open-faq",
  "application:open-discussions",
  "application:report-issue",
  "application:search-issues",
]);

module.exports = {
  Config,
  controlThemes,
  resolveControlTheme,
  exceptionCommands,
};
