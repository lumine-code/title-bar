const { humanizeKeystroke } = require("@lumine-code/underscore-plus");

class Utils {
  static formatKeystroke(keystroke) {
    return humanizeKeystroke(keystroke);
  }

  // A mnemonic is a literal `&` immediately before the accelerator letter.
  // Splitting the label on it rather than string-replacing is what keeps the
  // label out of `innerHTML`: menu labels are not all authored constants. The
  // `File > Reopen Project` entries are raw filesystem paths, and `<` is a
  // legal character in a directory name on macOS and linux.
  static parseAltKey(label) {
    const index = label.search(/&./);
    if (index === -1) {
      return { name: label, key: null, before: label, mnemonic: null, after: "" };
    }

    const mnemonic = label[index + 1];
    return {
      name: label.slice(0, index) + label.slice(index + 1),
      key: mnemonic.toLowerCase(),
      before: label.slice(0, index),
      mnemonic,
      after: label.slice(index + 2),
    };
  }

  // Renders a label as text nodes plus one `<u>` for the mnemonic. `mnemonics`
  // off renders the label verbatim, for a label that is data rather than
  // authored text -- a path containing `&` names no accelerator.
  static renderAltKey(element, label, { mnemonics = true } = {}) {
    if (!mnemonics) {
      element.textContent = label;
      return;
    }

    const { before, mnemonic, after } = Utils.parseAltKey(label);
    element.replaceChildren();

    if (before) {
      element.appendChild(document.createTextNode(before));
    }
    if (mnemonic) {
      const underline = document.createElement("u");
      underline.textContent = mnemonic;
      element.appendChild(underline);
    }
    if (after) {
      element.appendChild(document.createTextNode(after));
    }
  }

  static setToggleClass(elmnt, clazz, flag) {
    elmnt.classList.toggle(clazz, flag);
  }

  static mod(n, m) {
    return ((n % m) + m) % m;
  }

  static stopEvent(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  static rangeIntersects(min0, max0, min1, max1) {
    return (
      Math.max(min0, max0) >= Math.min(min1, max1) && Math.min(min0, max0) <= Math.max(min1, max1)
    );
  }

  static domRectIntersects(a, b) {
    return (
      Utils.rangeIntersects(a.x, a.x + a.width, b.x, b.x + b.width) &&
      Utils.rangeIntersects(a.y, a.y + a.height, b.y, b.y + b.height)
    );
  }
}

module.exports = { Utils };
