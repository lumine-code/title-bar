const { controlThemes, resolveControlTheme } = require("./types.js");
const { Utils } = require("./utils.js");

class ThemeManager {
  constructor(view) {
    this.view = view;
    this.controlTheme = undefined;
  }

  setWindowControlTheme(theme) {
    const resolved = resolveControlTheme(theme);
    const newTheme = controlThemes[resolved];
    if (!newTheme) {
      return;
    }

    if (this.controlTheme) {
      this.view.getElement().classList.remove(this.controlTheme.cssClass);
    }

    this.view.getElement().classList.add(newTheme.cssClass);
    this.controlTheme = newTheme;

    // Auto-set control position based on theme
    Utils.setToggleClass(this.view.getElement(), "reverse-controls", newTheme.reverseControls);
  }

  // Whether the application menu follows the window title rather than leading
  // it. Asked by the collision measurement, which has to know which edge the
  // menu is anchored to.
  isMenuOnTrailingEdge() {
    return this.controlTheme?.menuOnTrailingEdge ?? false;
  }
}

module.exports = { ThemeManager };
