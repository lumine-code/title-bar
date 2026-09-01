const { ControlTiles } = require("../lib/control-tiles");
const { TitleBarChrome } = require("../lib/title-bar-chrome");
const { Config } = require("../lib/types");
const manifest = require("../package.json");
const {
  TitleBarView,
  calculateAvailableMenuWidth,
  rectanglesIntersect,
  resolveLaunchMode,
  resolveLaunchIconFile,
} = require("../lib/view");

describe("Title Bar package", () => {
  let workspaceElement;
  let pack;

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    pack = await lumine.packages.activatePackage("title-bar");
  });

  it("owns the frameless window chrome", () => {
    const titleBar = workspaceElement.querySelector(".title-bar");

    expect(titleBar).toExist();
    expect(titleBar.querySelector(".app-icon")).toExist();
    expect(titleBar.querySelector(".custom-title")).toExist();
    expect(titleBar.querySelector(".btn-minimize")).toExist();
    expect(titleBar.querySelector(".btn-maximize")).toExist();
    expect(titleBar.querySelector(".btn-close")).toExist();
  });

  it("names window buttons for accessibility without attaching tooltips", () => {
    const buttons = workspaceElement.querySelectorAll(".title-bar .window-buttons button");

    expect(Array.from(buttons, (button) => button.getAttribute("aria-label"))).toEqual([
      "Minimize window",
      "Maximize window",
      "Close window",
    ]);
    for (const button of buttons) {
      expect(button.hasAttribute("title")).toBe(false);
      expect(button.hasAttribute("data-original-title")).toBe(false);
    }
  });

  it("has no menu-backend or native-title-bar configuration", () => {
    expect(Object.keys(manifest.configSchema)).toEqual([
      "controlTheme",
      "autoHide",
      "altGivesFocus",
    ]);
    expect(manifest.configSchema.customMenus).toBeUndefined();
    expect(manifest.configSchema.customContextMenus).toBeUndefined();
    expect(manifest.configSchema.autoHide).toEqual(
      jasmine.objectContaining({ type: "boolean", default: true }),
    );
    expect(manifest.configSchema.altGivesFocus).toEqual(
      jasmine.objectContaining({ type: "boolean", default: true }),
    );
    expect(manifest.dependencies).toBeUndefined();
  });

  it("mounts core's menu bar on Windows and Linux only", () => {
    const menuBar = workspaceElement.querySelector(".title-bar-menu-bar");

    if (process.platform === "darwin") {
      expect(menuBar).toBeNull();
      expect(window.titleBar.titleBarView.getMenuBar()).toBeNull();
    } else {
      expect(menuBar).toExist();
      expect(menuBar).toBe(window.titleBar.titleBarView.getMenuBar().element);
    }
  });

  it("keeps the app icon and application-menu labels hit-testable at the top edge", () => {
    const config = new Config();
    config.autoHide = false;
    const view = new TitleBarView(config, { platform: "win32" });
    Object.assign(view.element.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "800px",
      zIndex: "2147483647",
    });
    jasmine.attachToDOM(view.element);
    const menuBar = view.getMenuBar();

    try {
      const iconRect = view.appIcon.getBoundingClientRect();
      const iconTarget = document.elementFromPoint(
        Math.floor((iconRect.left + iconRect.right) / 2),
        0,
      );
      const labels = Array.from(
        menuBar.element.querySelectorAll(".menu-label:not(.overflow-menu-label):not(.overflowed)"),
      );
      expect(labels.length).toBeGreaterThan(1);
      const secondRect = labels[1].getBoundingClientRect();
      const edgeTarget = document.elementFromPoint(
        Math.floor((secondRect.left + secondRect.right) / 2),
        0,
      );
      const edgeLabel = edgeTarget?.closest?.(".menu-label");

      expect(iconRect.top).toBe(0);
      expect(iconTarget?.closest?.(".app-icon")).toBe(view.appIcon);
      expect(secondRect.top).toBe(0);
      expect(edgeLabel).toBe(labels[1]);

      labels[0].click();
      edgeLabel.dispatchEvent(new MouseEvent("mouseenter"));
      expect(menuBar.activeButton.element).toBe(labels[1]);
    } finally {
      menuBar.blur();
      view.deactivate();
    }
  });

  it("keeps visually inset control tiles hit-testable at the top window edge", () => {
    const view = new TitleBarView(new Config(), { platform: "win32" });
    Object.assign(view.element.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "800px",
      zIndex: "2147483647",
    });
    jasmine.attachToDOM(view.element);
    const controlTiles = view.getControlTiles();
    const row = view.controlTilesElement;
    row.style.setProperty("--title-bar-item-bleed", "0px");
    const tile = document.createElement("button");
    tile.style.width = "28px";
    tile.style.height = "calc(100% - 6px)";
    tile.style.marginBlock = "3px";
    const handle = controlTiles.addItem({ item: tile, priority: -1 });

    try {
      const tileRect = tile.getBoundingClientRect();
      const edgeTarget = document.elementFromPoint(
        Math.floor((tileRect.left + tileRect.right) / 2),
        0,
      );

      expect(tileRect.top).toBeGreaterThan(0);
      expect(edgeTarget?.closest?.(".title-bar-item")).toBe(tile);
    } finally {
      handle.destroy();
      view.deactivate();
    }
  });

  it("forwards menu settings to the core controller", () => {
    if (process.platform === "darwin") return;
    const menuBar = window.titleBar.titleBarView.getMenuBar();
    const setAutoHide = spyOn(menuBar, "setAutoHide").and.callThrough();
    const setAltGivesFocus = spyOn(menuBar, "setAltGivesFocus").and.callThrough();
    const previousAutoHide = lumine.config.get("title-bar.autoHide");
    const previousAltGivesFocus = lumine.config.get("title-bar.altGivesFocus");

    try {
      lumine.config.set("title-bar.autoHide", !previousAutoHide);
      lumine.config.set("title-bar.altGivesFocus", !previousAltGivesFocus);

      expect(setAutoHide).toHaveBeenCalledWith(!previousAutoHide);
      expect(setAltGivesFocus).toHaveBeenCalledWith(!previousAltGivesFocus);
    } finally {
      lumine.config.set("title-bar.autoHide", previousAutoHide);
      lumine.config.set("title-bar.altGivesFocus", previousAltGivesFocus);
    }
  });

  it("focuses the core menu controller through title-bar:focus-menu", () => {
    if (process.platform === "darwin") return;
    const menuBar = window.titleBar.titleBarView.getMenuBar();
    const focus = spyOn(menuBar, "focus");

    lumine.commands.dispatch(workspaceElement, "title-bar:focus-menu");

    expect(focus).toHaveBeenCalled();
  });

  it("reveals an auto-hidden menu from the app icon until the next action", () => {
    if (process.platform === "darwin") return;
    const view = window.titleBar.titleBarView;
    const menuBar = view.getMenuBar();
    view.setAutoHide(true);
    menuBar.blur();
    expect(menuBar.element.classList).toContain("no-menu-bar");

    view.appIcon.dispatchEvent(new MouseEvent("mouseenter"));

    expect(menuBar.element.classList).not.toContain("no-menu-bar");

    view.appIcon.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: document.body }));
    expect(menuBar.element.classList).not.toContain("no-menu-bar");

    document.body.click();

    expect(menuBar.element.classList).toContain("no-menu-bar");
  });

  it("keeps an auto-hidden menu visible while its popup is open", () => {
    if (process.platform === "darwin") return;
    const view = window.titleBar.titleBarView;
    const menuBar = view.getMenuBar();
    view.setAutoHide(true);
    menuBar.blur();
    view.appIcon.dispatchEvent(new MouseEvent("mouseenter"));
    const firstLabel = menuBar.element.querySelector(
      ".menu-label:not(.overflow-menu-label):not(.overflowed)",
    );

    firstLabel.click();
    menuBar.element.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: document.body }));

    expect(menuBar.popup).not.toBeNull();
    expect(menuBar.element.classList).not.toContain("no-menu-bar");

    menuBar.blur();
    expect(menuBar.element.classList).toContain("no-menu-bar");
  });

  it("makes window:toggle-menu-bar toggle auto-hide on Windows and Linux", () => {
    if (process.platform === "darwin") return;
    const previous = lumine.config.get("title-bar.autoHide");

    try {
      lumine.commands.dispatch(workspaceElement, "window:toggle-menu-bar");
      expect(lumine.config.get("title-bar.autoHide")).toBe(!previous);
    } finally {
      lumine.config.set("title-bar.autoHide", previous);
    }
  });

  it("lays out the core menu within the space before the centered title", () => {
    if (process.platform === "darwin") return;
    const view = window.titleBar.titleBarView;
    const menuBar = view.getMenuBar();
    spyOn(menuBar.element, "getBoundingClientRect").and.returnValue({
      left: 20,
      top: 0,
      right: 180,
      bottom: 32,
    });
    spyOn(view.titleElement, "getBoundingClientRect").and.returnValue({
      left: 220,
      top: 0,
      right: 420,
      bottom: 32,
    });
    spyOn(view.getThemeManager(), "isMenuOnTrailingEdge").and.returnValue(false);
    const layout = spyOn(menuBar, "layout");

    view.layout();

    expect(layout).toHaveBeenCalledWith(192);
  });

  it("sets intrinsic logo dimensions before styles load", () => {
    const logo = workspaceElement.querySelector(".title-bar .app-icon img");

    expect(logo.getAttribute("width")).toBe("24");
    expect(logo.getAttribute("height")).toBe("24");
  });

  it("uses the mode-appropriate Lumine logo", async () => {
    const logo = workspaceElement.querySelector(".title-bar .app-icon img");

    expect(logo.src.replace(/\\/g, "/")).toMatch(/\/resources\/app-icons\/lumine-dev\.svg$/);
    await new Promise((resolve) => {
      if (logo.complete) return resolve();
      logo.addEventListener("load", resolve, { once: true });
      logo.addEventListener("error", resolve, { once: true });
    });
    expect(logo.naturalWidth).toBe(128);
  });

  it("prioritizes safe, source, and dev launch modes for the logo indicator", () => {
    expect(resolveLaunchMode({ sourceMode: true, devMode: true, safeMode: true })).toBe("safe");
    expect(resolveLaunchMode({ sourceMode: false, devMode: false, safeMode: true })).toBe("safe");
    expect(resolveLaunchMode({ sourceMode: true, devMode: true, safeMode: false })).toBe("source");
    expect(resolveLaunchMode({ sourceMode: false, devMode: true, safeMode: false })).toBe("dev");
    expect(resolveLaunchMode({ sourceMode: false, devMode: false, safeMode: false })).toBeNull();
  });

  it("picks the icon file for each mode, safe outranking dev", () => {
    expect(resolveLaunchIconFile({ devMode: false, safeMode: false })).toBe("lumine.svg");
    expect(resolveLaunchIconFile({ devMode: true, safeMode: false })).toBe("lumine-dev.svg");
    expect(resolveLaunchIconFile({ devMode: false, safeMode: true })).toBe("lumine-safe.svg");
    expect(resolveLaunchIconFile({ devMode: true, safeMode: true })).toBe("lumine-safe.svg");
  });

  it("removes the chrome and destroys the core menu controller on deactivate", async () => {
    const menuBar = window.titleBar.titleBarView.getMenuBar();
    const destroy = menuBar ? spyOn(menuBar, "destroy").and.callThrough() : null;

    await Promise.resolve(lumine.packages.deactivatePackage("title-bar"));

    expect(workspaceElement.querySelector(".title-bar")).toBeNull();
    if (destroy) expect(destroy).toHaveBeenCalled();
  });

  it("puts the title bar back when the package is activated again", async () => {
    await Promise.resolve(lumine.packages.deactivatePackage("title-bar"));
    await lumine.packages.activatePackage("title-bar");

    expect(workspaceElement.querySelectorAll(".title-bar").length).toBe(1);
  });

  it("provides the control-tile collection", () => {
    const service = pack.mainModule.provideTitleBar();

    expect(service).toBe(window.titleBar.titleBarView.getControlTiles());
  });

  describe("macOS chrome", () => {
    let originalSetSheetOffset;
    let installedSetSheetOffset;

    beforeEach(() => {
      originalSetSheetOffset = lumine.window.setSheetOffset;
      if (typeof originalSetSheetOffset !== "function") {
        lumine.window.setSheetOffset = () => {};
        installedSetSheetOffset = true;
      }
    });

    afterEach(() => {
      if (installedSetSheetOffset) delete lumine.window.setSheetOffset;
      installedSetSheetOffset = false;
    });

    it("keeps the application menu native and tracks the HTML chrome height for sheets", () => {
      const setSheetOffset = spyOn(lumine.window, "setSheetOffset");
      const view = new TitleBarView(new Config(), { platform: "darwin" });
      spyOn(view.element, "getBoundingClientRect").and.returnValue({
        left: 0,
        top: 4,
        right: 800,
        bottom: 36,
        width: 800,
        height: 32,
      });
      setSheetOffset.calls.reset();

      view.updateSheetOffset({ force: true });

      expect(view.getMenuBar()).toBeNull();
      expect(view.element.querySelector(".title-bar-menu-bar")).toBeNull();
      expect(setSheetOffset).toHaveBeenCalledWith(32);

      view.setTitleBarVisible(false);
      expect(setSheetOffset).toHaveBeenCalledWith(0);

      setSheetOffset.calls.reset();
      view.deactivate();
      expect(setSheetOffset).toHaveBeenCalledWith(0);
    });

    it("preserves the AppleActionOnDoubleClick preference", async () => {
      const controller = {
        getState: async () => ({ fullscreen: false, maximized: false, visible: true }),
        getDoubleClickAction: async () => "Minimize",
        minimize: jasmine.createSpy("minimize"),
        maximize: jasmine.createSpy("maximize"),
      };
      const chrome = new TitleBarChrome({ controller, platform: "darwin" });

      await chrome.didDoubleClick({ target: chrome.titleElement });

      expect(controller.minimize).toHaveBeenCalled();
      expect(controller.maximize).not.toHaveBeenCalled();
      chrome.destroy();
    });
  });

  describe("layout helpers", () => {
    const menuRect = { left: 20, right: 780 };
    const titleRect = { left: 300, right: 500 };

    it("measures from the menu's anchored edge", () => {
      expect(calculateAvailableMenuWidth(menuRect, titleRect, 8, false)).toBe(272);
      expect(calculateAvailableMenuWidth(menuRect, titleRect, 8, true)).toBe(272);
    });

    it("never returns a negative width", () => {
      expect(calculateAvailableMenuWidth({ left: 400, right: 450 }, titleRect, 8, false)).toBe(0);
    });

    it("detects actual rectangle overlap", () => {
      expect(
        rectanglesIntersect(
          { left: 0, right: 20, top: 0, bottom: 20 },
          { left: 10, right: 30, top: 10, bottom: 30 },
        ),
      ).toBe(true);
      expect(
        rectanglesIntersect(
          { left: 0, right: 10, top: 0, bottom: 10 },
          { left: 10, right: 20, top: 0, bottom: 10 },
        ),
      ).toBe(false);
    });
  });

  describe("control tiles", () => {
    let controlTiles;

    beforeEach(() => {
      controlTiles = new ControlTiles(document.createElement("div"));
    });

    it("keeps tiles in priority order", () => {
      const last = document.createElement("button");
      const first = document.createElement("button");
      controlTiles.addItem({ item: last, priority: 20 });
      controlTiles.addItem({ item: first, priority: 10 });

      expect(controlTiles.element.children[0]).toBe(first);
      expect(controlTiles.element.children[1]).toBe(last);
    });

    it("stamps the tile class on a hosted element", () => {
      const button = document.createElement("button");
      controlTiles.addItem({ item: button, priority: 10 });

      expect(button.classList).toContain("title-bar-item");
    });

    it("removes the class when the tile is destroyed", () => {
      const button = document.createElement("button");
      const tile = controlTiles.addItem({ item: button, priority: 10 });
      tile.destroy();

      expect(button.classList).not.toContain("title-bar-item");
    });

    it("stamps a group's tiles rather than the group", () => {
      const group = document.createElement("title-bar-tile-group");
      const first = document.createElement("title-bar-tile");
      const second = document.createElement("title-bar-tile");
      group.append(first, second);

      const tile = controlTiles.addItem({ item: group, priority: 10 });

      expect(group.classList).not.toContain("title-bar-item");
      expect(first.classList).toContain("title-bar-item");
      expect(second.classList).toContain("title-bar-item");

      tile.destroy();
      expect(first.classList).not.toContain("title-bar-item");
      expect(second.classList).not.toContain("title-bar-item");
    });

    it("leaves the other tiles alone when one is destroyed twice", () => {
      const first = document.createElement("button");
      const second = document.createElement("button");
      const firstTile = controlTiles.addItem({ item: first, priority: 1 });
      controlTiles.addItem({ item: second, priority: 2 });

      firstTile.destroy();
      firstTile.destroy();

      const remaining = controlTiles.getTiles();
      expect(remaining.length).toBe(1);
      expect(remaining[0].getItem()).toBe(second);
      expect(second.classList).toContain("title-bar-item");
    });

    it("destroys every tile it holds", () => {
      const button = document.createElement("button");
      const tile = controlTiles.addItem({ item: button, priority: 10 });

      controlTiles.destroy();

      expect(controlTiles.getTiles().length).toBe(0);
      expect(button.classList).not.toContain("title-bar-item");
      expect(button.parentElement).toBeNull();

      tile.destroy();
      expect(controlTiles.getTiles().length).toBe(0);
    });

    it("does not stamp nested layout elements", () => {
      const button = document.createElement("button");
      const inner = document.createElement("span");
      inner.classList.add("inline-block");
      button.appendChild(inner);

      controlTiles.addItem({ item: button, priority: 10 });

      expect(button.classList).toContain("title-bar-item");
      expect(inner.classList).not.toContain("title-bar-item");
    });
  });
});
