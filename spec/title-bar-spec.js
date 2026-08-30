const { Utils } = require("../lib/utils");
const { ApplicationMenu, shouldUseGlobalApplicationMenu } = require("../lib/app-menu");
const { ControlTiles } = require("../lib/control-tiles");
const { ContextMenuInterceptor } = require("../lib/context-menu-interceptor");
const { MenuItem } = require("../lib/item");
const { MenuLabel } = require("../lib/label");
const { MenuUpdater } = require("../lib/updater");
const { Config } = require("../lib/types");
const { ThemeManager } = require("../lib/theme");
const manifest = require("../package.json");
const {
  TitleBarView,
  calculateAvailableMenuWidth,
  calculateVisibleLabelCount,
  resolveLaunchMode,
  resolveLaunchIconFile,
} = require("../lib/view");

describe("Title Bar package", () => {
  let workspaceElement;

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);

    await lumine.packages.activatePackage("title-bar");
  });

  it("adds a custom title bar to the workspace header", () => {
    expect(workspaceElement.querySelectorAll(".title-bar").length).toBe(1);
  });

  it("exposes the single custom menu setting without the preproduction alias", () => {
    expect(manifest.configSchema.customMenus).toEqual(
      jasmine.objectContaining({ title: "Custom Menus", type: "boolean", default: true }),
    );
    expect(manifest.configSchema.customContextMenus).toBeUndefined();
  });

  it("adds window controls", () => {
    const titleBar = workspaceElement.querySelector(".title-bar");

    expect(titleBar.querySelector(".btn-minimize")).toExist();
    expect(titleBar.querySelector(".btn-maximize")).toExist();
    expect(titleBar.querySelector(".btn-close")).toExist();
  });

  it("populates the application menu", () => {
    const titleBar = workspaceElement.querySelector(".title-bar");

    expect(titleBar.querySelector(".app-menu .menu-item")).toExist();
  });

  it("rounds only the outer corners of left-side menu scrollbars", () => {
    jasmine.attachToDOM(workspaceElement);
    const menuBox = workspaceElement.querySelector(".title-bar .app-menu .menu-label .menu-box");
    const scrollbarStyle = getComputedStyle(menuBox, "::-webkit-scrollbar");
    const trackStyle = getComputedStyle(menuBox, "::-webkit-scrollbar-track");
    const cornerStyle = getComputedStyle(menuBox, "::-webkit-scrollbar-corner");

    expect(scrollbarStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(trackStyle.borderTopLeftRadius).toBe("6px");
    expect(trackStyle.borderTopRightRadius).toBe("0px");
    expect(trackStyle.borderBottomRightRadius).toBe("0px");
    expect(trackStyle.borderBottomLeftRadius).toBe("6px");
    expect(cornerStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("sets intrinsic logo dimensions before styles load", () => {
    const logo = workspaceElement.querySelector(".title-bar .app-icon img");

    expect(logo.getAttribute("width")).toBe("24");
    expect(logo.getAttribute("height")).toBe("24");
  });

  it("uses the mode-appropriate Lumine logo", async () => {
    const logo = workspaceElement.querySelector(".title-bar .app-icon img");

    // `--test` forces devMode on (parse-command-line.js), so every spec run
    // is a dev-mode run and the dev-colored mark is the one actually shown.
    expect(logo.src.replace(/\\/g, "/")).toMatch(/\/resources\/app-icons\/lumine-dev\.svg$/);

    // The decode is asynchronous and nothing before this point awaits it, so
    // `complete` is a race — assert it only after the load settles. `error`
    // resolves too rather than hanging, so a missing icon fails on
    // naturalWidth instead of timing the spec out.
    await new Promise((resolve) => {
      if (logo.complete) return resolve();
      logo.addEventListener("load", resolve, { once: true });
      logo.addEventListener("error", resolve, { once: true });
    });

    expect(logo.naturalWidth).toBe(128);
  });

  it("prioritizes safe, source, and dev launch modes for the logo indicator", () => {
    // Safe mode wins even when a source checkout also reports dev/source.
    expect(resolveLaunchMode({ sourceMode: true, devMode: true, safeMode: true })).toBe("safe");
    expect(resolveLaunchMode({ sourceMode: false, devMode: false, safeMode: true })).toBe("safe");
    // `npm start` reports both source and dev; source marks it distinctly.
    expect(resolveLaunchMode({ sourceMode: true, devMode: true, safeMode: false })).toBe("source");
    // A bare dev window (packaged build) has neither safe nor source set.
    expect(resolveLaunchMode({ sourceMode: false, devMode: true, safeMode: false })).toBe("dev");
    expect(resolveLaunchMode({ sourceMode: false, devMode: false, safeMode: false })).toBeNull();
  });

  it("picks the icon file for each mode, safe outranking dev", () => {
    expect(resolveLaunchIconFile({ devMode: false, safeMode: false })).toBe("lumine.svg");
    expect(resolveLaunchIconFile({ devMode: true, safeMode: false })).toBe("lumine-dev.svg");
    expect(resolveLaunchIconFile({ devMode: false, safeMode: true })).toBe("lumine-safe.svg");
    // There is no separate "source" icon -- safe still wins over dev when
    // both are set, matching resolveLaunchMode's own priority.
    expect(resolveLaunchIconFile({ devMode: true, safeMode: true })).toBe("lumine-safe.svg");
  });

  it("removes the title bar on deactivate", async () => {
    await Promise.resolve(lumine.packages.deactivatePackage("title-bar"));

    expect(workspaceElement.querySelector(".title-bar")).toBeNull();
    expect(document.querySelector(".app-menu-submenu-portal")).toBeNull();
  });

  // The operating system draws the bar in that configuration, and a second one
  // below it is not something anybody asked for. The service resolves to
  // undefined then, which is the case its contract tells consumers to guard.
  it("draws nothing when the window keeps its native title bar", async () => {
    await Promise.resolve(lumine.packages.deactivatePackage("title-bar"));
    lumine.config.set("core.titleBar", "native");

    try {
      const pack = await lumine.packages.activatePackage("title-bar");

      expect(workspaceElement.querySelector(".title-bar")).toBeNull();
      expect(pack.mainModule.provideTitleBar()).toBeUndefined();
    } finally {
      // Every following spec activates the package again, so leaving the
      // setting behind would take the whole file down with it.
      lumine.config.set("core.titleBar", "custom");
    }
  });

  // The header panel is added from the first `observeActivePane` callback,
  // gated on a flag that outlived the view it guarded -- so the bar came back
  // without one and never reached the DOM again.
  it("puts the title bar back when the package is activated again", async () => {
    await Promise.resolve(lumine.packages.deactivatePackage("title-bar"));
    await lumine.packages.activatePackage("title-bar");

    expect(workspaceElement.querySelectorAll(".title-bar").length).toBe(1);
  });

  it("switches application and context menu backends live from one setting", async () => {
    const customContextMenu = lumine.contextMenu.showForEvent;
    const appMenuElement = workspaceElement.querySelector(".title-bar .app-menu");
    const firstLabel = appMenuElement.querySelector(".menu-label");
    spyOn(lumine.window, "showApplicationMenuPopup").and.resolveTo(true);
    spyOn(lumine.window, "closeApplicationMenuPopup").and.returnValue(false);

    try {
      lumine.config.set("title-bar.customMenus", false);

      const appMenu = window.titleBar.titleBarView.getApplicationMenu();
      appMenu.setOverflowStartIndex(appMenu.getLabels().length);
      appMenu.getLabels().forEach((label, index) => {
        spyOn(label.getElement(), "getBoundingClientRect").and.returnValue({
          left: index * 40,
          top: 0,
          right: (index + 1) * 40,
          bottom: 24,
        });
      });

      expect(lumine.contextMenu.showForEvent).not.toBe(customContextMenu);
      expect(appMenuElement.classList.contains("native-global-menu")).toBe(
        process.platform === "darwin",
      );
      firstLabel.click();
      await flushMicrotasks();
      if (process.platform === "darwin") {
        expect(lumine.window.showApplicationMenuPopup).not.toHaveBeenCalled();
      } else {
        expect(lumine.window.showApplicationMenuPopup).toHaveBeenCalled();
      }

      const nativeContextMenu = lumine.contextMenu.showForEvent;
      lumine.config.set("title-bar.customMenus", true);
      expect(lumine.contextMenu.showForEvent).not.toBe(nativeContextMenu);
      expect(appMenuElement.classList).not.toContain("native-global-menu");
    } finally {
      lumine.config.set("title-bar.customMenus", true);
    }
  });

  it("closes native application popups on resize, menu update, and deactivate", async () => {
    if (process.platform === "darwin") return;
    spyOn(lumine.window, "showApplicationMenuPopup").and.returnValue(new Promise(() => {}));
    const closePopup = spyOn(lumine.window, "closeApplicationMenuPopup").and.resolveTo(true);

    try {
      lumine.config.set("title-bar.customMenus", false);
      const view = window.titleBar.titleBarView;
      const appMenu = view.getApplicationMenu();
      appMenu.setOverflowStartIndex(appMenu.getLabels().length);
      appMenu.getLabels().forEach((label, index) => {
        spyOn(label.getElement(), "getBoundingClientRect").and.returnValue({
          left: index * 40,
          top: 0,
          right: (index + 1) * 40,
          bottom: 24,
        });
      });
      const firstLabel = appMenu.getLabels()[0];

      firstLabel.getElement().click();
      await flushMicrotasks();
      view.handleWindowResize();
      await flushMicrotasks();
      expect(closePopup.calls.count()).toBe(1);

      firstLabel.getElement().click();
      await flushMicrotasks();
      view.menuUpdateWrapper();
      await flushMicrotasks();
      expect(closePopup.calls.count()).toBe(2);

      firstLabel.getElement().click();
      await flushMicrotasks();
      await Promise.resolve(lumine.packages.deactivatePackage("title-bar"));
      await flushMicrotasks();
      expect(closePopup.calls.count()).toBe(3);
    } finally {
      lumine.config.set("title-bar.customMenus", true);
    }
  });

  it("does not overwrite context-menu integrations installed after its wrappers", () => {
    const originalShowForEvent = lumine.contextMenu.showForEvent;
    const interceptor = new ContextMenuInterceptor();
    const laterShowForEvent = () => {};

    try {
      interceptor.activate();
      lumine.contextMenu.showForEvent = laterShowForEvent;
      interceptor.deactivate();

      expect(lumine.contextMenu.showForEvent).toBe(laterShowForEvent);
    } finally {
      interceptor.deactivate();
      lumine.contextMenu.showForEvent = originalShowForEvent;
    }
  });

  // The strip is inset from the window top, and every interactive item in it
  // reaches back into that inset so its hit target touches the screen edge on a
  // maximised window, padding its content back down to stay centred. A tile
  // that skipped it stopped 4px short of the app menu beside it under any theme
  // drawing tiles full height.
  it("bleeds a control tile the same as the application menu's labels", () => {
    jasmine.attachToDOM(workspaceElement);
    const titleBar = workspaceElement.querySelector(".title-bar");
    const controlTiles = titleBar.querySelector(".control-tiles");

    const button = document.createElement("button");
    button.classList.add("title-bar-item");
    controlTiles.appendChild(button);

    const label = titleBar.querySelector(".app-menu .menu-label");
    const tileBox = button.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();

    expect(Math.round(tileBox.top)).toBe(Math.round(labelBox.top));
    expect(Math.round(tileBox.bottom)).toBe(Math.round(labelBox.bottom));
    expect(getComputedStyle(button).paddingTop).toBe(getComputedStyle(label).paddingTop);

    // The row clips its overflow so a long window title cannot push a tile out
    // of the bar, and a clip is taken at the padding box — so the row has to
    // start no lower than the tile, or the bleed is laid out and then painted
    // away. `getBoundingClientRect` reports the unclipped box and says nothing
    // about it, which is exactly how this went unnoticed.
    const rowBox = controlTiles.getBoundingClientRect();
    expect(Math.round(rowBox.top)).toBe(Math.round(tileBox.top));

    button.remove();
  });

  describe("control tiles", () => {
    let controlTiles;

    beforeEach(() => {
      controlTiles = new ControlTiles(document.createElement("div"));
    });

    it("stamps the tile class on a hosted element", () => {
      const button = document.createElement("button");
      controlTiles.addItem({ item: button, priority: 10 });

      expect(button.classList).toContain("title-bar-item");
    });

    // The bar hands the element back to whoever gave it, so it must not keep
    // a class that says the element is still hosted.
    it("removes it again when the tile is destroyed", () => {
      const button = document.createElement("button");
      const tile = controlTiles.addItem({ item: button, priority: 10 });
      tile.destroy();

      expect(button.classList).not.toContain("title-bar-item");
    });

    // A group carries several controls in as one entry. It is a layout box, so
    // the mark belongs on each control: left on the group, a theme paints one
    // rectangle across the lot and a second inside it.
    it("stamps a group's tiles rather than the group", () => {
      const group = document.createElement("title-bar-tile-group");
      const first = document.createElement("title-bar-tile");
      const second = document.createElement("title-bar-tile");
      group.appendChild(first);
      group.appendChild(second);

      const tile = controlTiles.addItem({ item: group, priority: 10 });

      expect(group.classList).not.toContain("title-bar-item");
      expect(first.classList).toContain("title-bar-item");
      expect(second.classList).toContain("title-bar-item");

      tile.destroy();
      expect(first.classList).not.toContain("title-bar-item");
      expect(second.classList).not.toContain("title-bar-item");
    });

    // Destroying the bar destroys every tile it holds, so a package's own
    // teardown routinely runs second. An unguarded splice(-1, 1) evicted the
    // last tile in the collection -- some other package's -- instead.
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

      // The package's own disposable still runs afterwards, and must not throw
      // or take anything else with it.
      tile.destroy();
      expect(controlTiles.getTiles().length).toBe(0);
    });

    // A tile is the element the bar hosts, never a block nested inside one:
    // packages use `.inline-block` for layout within a tile, so a theme keying
    // on that paints the nesting as a second tile.
    it("does not stamp anything the item nests inside itself", () => {
      const button = document.createElement("button");
      const inner = document.createElement("span");
      inner.classList.add("inline-block");
      button.appendChild(inner);

      controlTiles.addItem({ item: button, priority: 10 });

      expect(button.classList).toContain("title-bar-item");
      expect(inner.classList).not.toContain("title-bar-item");
    });
  });

  describe("menu template", () => {
    let originalTemplate;

    beforeEach(() => {
      originalTemplate = lumine.menu.template;
    });

    afterEach(() => {
      lumine.menu.template = originalTemplate;
    });

    // The mnemonic marker is written into the win32 and linux menu files only;
    // darwin's say "Packages" plainly, so matching the raw label left the
    // submenu unsorted on one platform out of three.
    it("sorts the Packages submenu whether or not its label carries a mnemonic", () => {
      for (const label of ["&Packages", "Packages"]) {
        lumine.menu.template = [
          {
            label,
            submenu: [{ label: "Zebra" }, { label: "alpha" }, { label: "Mike" }],
          },
        ];

        const [packages] = MenuUpdater.getTemplate();
        expect(packages.submenu.map((item) => item.label)).toEqual(["alpha", "Mike", "Zebra"]);
      }
    });

    it("leaves every other menu in the order it was given", () => {
      lumine.menu.template = [
        { label: "&File", submenu: [{ label: "Zebra" }, { label: "alpha" }] },
      ];

      const [file] = MenuUpdater.getTemplate();
      expect(file.submenu.map((item) => item.label)).toEqual(["Zebra", "alpha"]);
    });

    it("replaces a top-level label when its stable ID changes", () => {
      const label = MenuLabel.createMenuLabel({ id: "old", label: "&File", submenu: [] });

      expect(MenuUpdater.equals(label, { id: "old", label: "&File" })).toBe(true);
      expect(MenuUpdater.equals(label, { id: "new", label: "&File" })).toBe(false);
      expect(label.getId()).toBe("old");
    });
  });

  it("leaves a later menu-update wrapper installed during teardown", () => {
    const hadOwnMenuUpdate = Object.hasOwn(lumine.menu, "update");
    const originalMenuUpdate = lumine.menu.update;
    const view = Object.create(TitleBarView.prototype);
    const ownedWrapper = () => {};
    const laterWrapper = () => {};
    Object.assign(view, {
      hadOwnMenuUpdate,
      originalMenuUpdateFn: originalMenuUpdate,
      menuUpdateWrapper: ownedWrapper,
      menuUpdateAttached: true,
    });

    try {
      lumine.menu.update = laterWrapper;
      view.detachMenuUpdater();
      expect(lumine.menu.update).toBe(laterWrapper);
    } finally {
      if (hadOwnMenuUpdate) lumine.menu.update = originalMenuUpdate;
      else delete lumine.menu.update;
    }
  });

  describe("label rendering", () => {
    it("underlines the mnemonic letter", () => {
      const item = MenuItem.createMenuItem({ label: "&File", command: "example:noop" });
      const name = item.getElement().querySelector(".menu-item-name");

      expect(name.textContent).toBe("File");
      expect(name.querySelector("u").textContent).toBe("F");
      expect(item.getAltTrigger()).toBe("f");
    });

    // A `File > Reopen Project` label is a raw filesystem path, and `<` is a
    // legal character in a directory name on macOS and linux. Rendered as
    // markup it would run in a renderer that has Node integration.
    it("renders a path label as text, markup and all", () => {
      const projectPath = "/tmp/<img src=x onerror=boom>";
      const item = MenuItem.createMenuItem({
        label: projectPath,
        command: "application:reopen-project",
        commandDetail: { paths: [projectPath] },
      });
      const name = item.getElement().querySelector(".menu-item-name");

      expect(name.textContent).toBe(projectPath);
      expect(name.querySelector("img")).toBeNull();
    });

    // An `&` in a path names no accelerator -- it belongs to the directory's
    // name, and stripping it renamed the project in the menu.
    it("keeps an ampersand that came from a path", () => {
      const projectPath = "/tmp/foo&bar";
      const item = MenuItem.createMenuItem({
        label: projectPath,
        command: "application:reopen-project",
        commandDetail: { paths: [projectPath] },
      });

      expect(item.getElement().querySelector(".menu-item-name").textContent).toBe(projectPath);
      expect(item.getAltTrigger()).toBeUndefined();
      expect(item.getElement().hasAttribute("alt-trigger")).toBe(false);
    });

    it("renders a top-level menu label the same way", () => {
      const label = MenuLabel.createMenuLabel({ label: "&Edit", submenu: [] });

      expect(label.getElement().querySelector("u").textContent).toBe("E");
      expect(label.getElement().getAttribute("label")).toBe("Edit");
      expect(label.getAltTrigger()).toBe("e");
    });
  });

  describe("keystroke resolution", () => {
    let keymaps, parent, child;

    beforeEach(() => {
      parent = document.createElement("div");
      parent.classList.add("keystroke-parent");
      child = document.createElement("div");
      child.classList.add("keystroke-child");
      parent.appendChild(child);
      document.body.appendChild(parent);

      keymaps = lumine.keymaps.add("title-bar-spec", {
        ".keystroke-child": { "ctrl-a": "test:scoped-command" },
      });
    });

    afterEach(() => {
      keymaps.dispose();
      parent.remove();
    });

    it("shows a binding that applies at the right-clicked element", () => {
      const item = MenuItem.createContextMenuItem(
        { label: "Scoped", command: "test:scoped-command" },
        child,
      );
      item.ensureKeystroke();

      expect(item.getElement().querySelector(".menu-item-keystroke").textContent).toBe(
        Utils.formatKeystroke("ctrl-a"),
      );
    });

    it("shows nothing when the binding does not reach the right-clicked element", () => {
      // The command dispatches at the element that was right-clicked, so a
      // binding scoped to a descendant of it would not fire and must not be
      // advertised. Resolving with no target could not tell the difference.
      const item = MenuItem.createContextMenuItem(
        { label: "Scoped", command: "test:scoped-command" },
        parent,
      );
      item.ensureKeystroke();

      expect(item.getElement().querySelector(".menu-item-keystroke").textContent).toBe("");
    });

    it("still resolves for a menu-bar item, which has no element to resolve against", () => {
      const item = MenuItem.createMenuItem({ label: "Scoped", command: "test:scoped-command" });
      item.ensureKeystroke();

      expect(item.getElement().querySelector(".menu-item-keystroke").textContent).toBe(
        Utils.formatKeystroke("ctrl-a"),
      );
    });
  });

  describe("keystroke formatting", () => {
    it("formats modifiers, shifted symbols, and multi-stroke bindings", () => {
      if (process.platform === "darwin") {
        expect(Utils.formatKeystroke("cmdorctrl-shift-f")).toBe("⌘⇧F");
        expect(Utils.formatKeystroke("cmd-|")).toBe("⌘⇧\\");
        expect(Utils.formatKeystroke("cmd-k right")).toBe("⌘K →");
      } else {
        expect(Utils.formatKeystroke("cmdorctrl-shift-f")).toBe("Ctrl+Shift+F");
        expect(Utils.formatKeystroke("cmd-|")).toBe("Cmd+Shift+\\");
        expect(Utils.formatKeystroke("cmd-k right")).toBe("Cmd+K Right");
      }
    });
  });

  describe("responsive application menu", () => {
    let appMenu;

    let configState;
    let platform;
    let setMenuBarVisible;

    const parent = {
      getConfigState() {
        return configState;
      },
      getPlatform() {
        return platform;
      },
      isMenuBarVisible() {
        return true;
      },
      isTitleBarVisible() {
        return true;
      },
      setMenuBarVisible(visible) {
        setMenuBarVisible(visible);
      },
    };

    beforeEach(() => {
      configState = new Config();
      platform = "win32";
      setMenuBarVisible = jasmine.createSpy("setMenuBarVisible");
    });

    function setNativeMenuBounds(menu, overrides = {}) {
      const defaults = {
        File: { left: 10.2, top: 4.8, right: 48.1, bottom: 25.2 },
        Edit: { left: 48.1, top: 4.8, right: 86.3, bottom: 25.2 },
        Help: { left: 86.3, top: 4.8, right: 128.4, bottom: 25.2 },
        overflow: { left: 48.1, top: 4.8, right: 76.2, bottom: 25.2 },
      };
      [...menu.getLabels(), menu.overflowLabel].forEach((label) => {
        const key = label === menu.overflowLabel ? "overflow" : label.getId();
        spyOn(label.getElement(), "getBoundingClientRect").and.returnValue(
          overrides[key] ?? defaults[key],
        );
      });
    }

    function requestWithoutHoverMetadata(request) {
      const {
        hoverTargets: _hoverTargets,
        activeHoverTarget: _activeHoverTarget,
        ...base
      } = request;
      return base;
    }

    function switchEventTarget(target) {
      const { bounds: _bounds, ...eventTarget } = target;
      return eventTarget;
    }

    const template = [
      {
        id: "File",
        label: "&File",
        submenu: [{ label: "&New", command: "application:new-file" }],
      },
      {
        id: "Edit",
        label: "&Edit",
        submenu: [
          { label: "&Undo", command: "core:undo" },
          { type: "separator" },
          { label: "Disabled", command: "example:disabled", enabled: false },
        ],
      },
      {
        id: "Help",
        label: "&Help",
        submenu: [{ label: "&About", command: "application:about" }],
      },
    ];

    afterEach(() => {
      appMenu?.destroy();
      appMenu?.getElement().remove();
      appMenu = null;
    });

    it("reserves the overflow label before hiding trailing labels", () => {
      expect(calculateVisibleLabelCount([40, 40, 40], 120, 24)).toBe(3);
      expect(calculateVisibleLabelCount([40, 40, 40], 104, 24)).toBe(2);
      expect(calculateVisibleLabelCount([40, 40, 40], 20, 24)).toBe(0);
    });

    it("reserves title space from the application menu's anchored edge", () => {
      const titleRect = { left: 450, right: 550 };

      expect(calculateAvailableMenuWidth({ left: 32, right: 332 }, titleRect, 8, 8, false)).toBe(
        402,
      );
      expect(calculateAvailableMenuWidth({ left: 700, right: 1000 }, titleRect, 8, 8, true)).toBe(
        434,
      );
    });

    // Which edge the menu is anchored to is the theme's to say. Reading it back
    // off the bar's class list meant the measurement named one theme and the
    // stylesheet named another, with nothing to keep the two in step.
    it("takes the anchored edge from the control theme", () => {
      const themeManager = new ThemeManager({ getElement: () => document.createElement("div") });

      themeManager.setWindowControlTheme("Windows 11");
      expect(themeManager.isMenuOnTrailingEdge()).toBe(false);

      themeManager.setWindowControlTheme("GNOME");
      expect(themeManager.isMenuOnTrailingEdge()).toBe(false);

      themeManager.setWindowControlTheme("macOS Tahoe");
      expect(themeManager.isMenuOnTrailingEdge()).toBe(true);
    });

    it("moves trailing menus into an overflow submenu and restores them", () => {
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      appMenu.setOverflowStartIndex(1);

      expect(appMenu.getNavigableLabels().map((label) => label.getLabelText())).toEqual([
        "&File",
        "...",
      ]);
      expect(appMenu.overflowLabel.getSubmenu().map((item) => item.getLabelText())).toEqual([
        "&Edit",
        "&Help",
      ]);
      expect(appMenu.overflowLabel.getSubmenu()[0].getSubmenu()[1].isSeparator()).toBe(true);
      expect(appMenu.overflowLabel.getSubmenu()[0].getSubmenu()[2].isEnabled()).toBe(false);

      appMenu.setOverflowStartIndex(template.length);

      expect(appMenu.getNavigableLabels().map((label) => label.getLabelText())).toEqual([
        "&File",
        "&Edit",
        "&Help",
      ]);
      expect(appMenu.overflowLabel.getSubmenu().length).toBe(0);
    });

    it("keeps mouse and keyboard paths on the HTML backend when custom menus are enabled", () => {
      spyOn(lumine.window, "showApplicationMenuPopup");
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      const file = appMenu.getLabels()[0];

      file.getElement().click();
      expect(file.isOpen()).toBe(true);
      appMenu.close();

      for (const key of ["Enter", "ArrowDown"]) {
        appMenu.focusFirstLabel();
        appMenu.onKeyDown({
          key,
          repeat: false,
          stopPropagation() {},
          preventDefault() {},
        });
        expect(file.isOpen()).toBe(true);
        expect(file.getSubmenu().getSelected()?.getLabelText()).toBe("&New");
        appMenu.close();
      }

      expect(lumine.window.showApplicationMenuPopup).not.toHaveBeenCalled();
    });

    it("opens a top-level native submenu from a mouse click", async () => {
      configState.customMenus = false;
      configState.autoHide = true;
      let closePopup;
      spyOn(lumine.window, "showApplicationMenuPopup").and.callFake(
        () =>
          new Promise((resolve) => {
            closePopup = resolve;
          }),
      );
      spyOn(lumine.window, "closeApplicationMenuPopup").and.returnValue(false);
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      const file = appMenu.getLabels()[0];
      setNativeMenuBounds(appMenu, {
        File: { left: 12.4, top: 5.8, right: 52.1, bottom: 34.6 },
      });

      file.getElement().click();
      await flushMicrotasks();

      const request = lumine.window.showApplicationMenuPopup.calls.mostRecent().args[0];
      expect(requestWithoutHoverMetadata(request)).toEqual({
        kind: "submenu",
        id: "File",
        x: 12,
        y: 35,
        sourceType: "mouse",
      });
      expect(request.hoverTargets.map(({ key: _key, ...target }) => target)).toEqual([
        { kind: "submenu", id: "File", bounds: { x: 12, y: 5, width: 41, height: 30 } },
        { kind: "submenu", id: "Edit", bounds: { x: 48, y: 4, width: 39, height: 22 } },
        { kind: "submenu", id: "Help", bounds: { x: 86, y: 4, width: 43, height: 22 } },
      ]);
      expect(request.activeHoverTarget).toBe(request.hoverTargets[0].key);
      expect(file.isFocused()).toBe(true);
      expect(file.isOpen()).toBe(false);

      closePopup(true);
      await flushMicrotasks();
      expect(file.isFocused()).toBe(false);
      expect(setMenuBarVisible).toHaveBeenCalledWith(false);
    });

    it("opens focused native menus from Enter and ArrowDown as keyboard requests", async () => {
      configState.customMenus = false;
      spyOn(lumine.window, "showApplicationMenuPopup").and.resolveTo(true);
      spyOn(lumine.window, "closeApplicationMenuPopup").and.returnValue(false);
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      setNativeMenuBounds(appMenu, {
        File: { left: 2, top: 1, right: 42, bottom: 8 },
      });

      for (const key of ["Enter", "ArrowDown"]) {
        appMenu.focusFirstLabel();
        appMenu.onKeyDown({
          key,
          repeat: false,
          stopPropagation() {},
          preventDefault() {},
        });
        await flushMicrotasks();
      }

      expect(lumine.window.showApplicationMenuPopup.calls.count()).toBe(2);
      expect(
        lumine.window.showApplicationMenuPopup.calls
          .allArgs()
          .map(([request]) => requestWithoutHoverMetadata(request)),
      ).toEqual([
        { kind: "submenu", id: "File", x: 2, y: 8, sourceType: "keyboard" },
        { kind: "submenu", id: "File", x: 2, y: 8, sourceType: "keyboard" },
      ]);
    });

    it("opens the native overflow popup with canonical trailing IDs", async () => {
      configState.customMenus = false;
      spyOn(lumine.window, "showApplicationMenuPopup").and.resolveTo(true);
      spyOn(lumine.window, "closeApplicationMenuPopup").and.returnValue(false);
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      appMenu.setOverflowStartIndex(1);
      setNativeMenuBounds(appMenu, {
        overflow: { left: 40, top: 6, right: 70, bottom: 28 },
      });

      appMenu.overflowLabel.getElement().click();
      await flushMicrotasks();

      let request = lumine.window.showApplicationMenuPopup.calls.mostRecent().args[0];
      expect(requestWithoutHoverMetadata(request)).toEqual({
        kind: "overflow",
        ids: ["Edit", "Help"],
        x: 40,
        y: 28,
        sourceType: "mouse",
      });
      expect(request.hoverTargets.map((target) => target.kind)).toEqual(["submenu", "overflow"]);
      expect(request.activeHoverTarget).toBe(request.hoverTargets[1].key);

      appMenu.focusLastLabel();
      appMenu.onKeyDown({
        key: "Enter",
        repeat: false,
        stopPropagation() {},
        preventDefault() {},
      });
      await flushMicrotasks();
      request = lumine.window.showApplicationMenuPopup.calls.mostRecent().args[0];
      expect(requestWithoutHoverMetadata(request)).toEqual({
        kind: "overflow",
        ids: ["Edit", "Help"],
        x: 40,
        y: 28,
        sourceType: "keyboard",
      });
    });

    it("opens an overflowed mnemonic directly and anchors it under the overflow label", async () => {
      configState.customMenus = false;
      spyOn(lumine.window, "showApplicationMenuPopup").and.resolveTo(true);
      spyOn(lumine.window, "closeApplicationMenuPopup").and.returnValue(false);
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      appMenu.setOverflowStartIndex(1);
      appMenu.showAltKeys(true);
      setNativeMenuBounds(appMenu, {
        overflow: { left: 50.6, top: 7.2, right: 80.1, bottom: 30.4 },
      });

      appMenu.onKeyDown({
        key: "h",
        repeat: false,
        stopPropagation() {},
        preventDefault() {},
      });
      await flushMicrotasks();

      const request = lumine.window.showApplicationMenuPopup.calls.mostRecent().args[0];
      expect(requestWithoutHoverMetadata(request)).toEqual({
        kind: "submenu",
        id: "Help",
        x: 51,
        y: 30,
        sourceType: "keyboard",
      });
      const overflowTarget = request.hoverTargets.find((target) => target.kind === "overflow");
      expect(request.activeHoverTarget).toBe(overflowTarget.key);
    });

    it("switches a pending native popup from File to Edit on a current hover request", async () => {
      configState.customMenus = false;
      let requestSwitch;
      const originalSubscription = lumine.window.onDidRequestApplicationMenuPopupSwitch;
      const switchSubscription = jasmine.createSpyObj("switchSubscription", ["dispose"]);
      lumine.window.onDidRequestApplicationMenuPopupSwitch = (callback) => {
        requestSwitch = callback;
        return switchSubscription;
      };
      spyOn(lumine.window, "showApplicationMenuPopup").and.returnValue(new Promise(() => {}));
      const closePopup = spyOn(lumine.window, "closeApplicationMenuPopup").and.resolveTo(true);

      try {
        appMenu = ApplicationMenu.createApplicationMenu(template, parent);
        setNativeMenuBounds(appMenu);
        const [file, edit] = appMenu.getLabels();

        file.getElement().click();
        await flushMicrotasks();
        const firstRequest = lumine.window.showApplicationMenuPopup.calls.argsFor(0)[0];
        const editTarget = firstRequest.hoverTargets.find((target) => target.id === "Edit");

        requestSwitch({
          from: firstRequest.activeHoverTarget,
          target: switchEventTarget(editTarget),
        });
        await flushMicrotasks();

        expect(closePopup).toHaveBeenCalledTimes(1);
        expect(lumine.window.showApplicationMenuPopup).toHaveBeenCalledTimes(2);
        expect(
          requestWithoutHoverMetadata(
            lumine.window.showApplicationMenuPopup.calls.mostRecent().args[0],
          ),
        ).toEqual({ kind: "submenu", id: "Edit", x: 48, y: 25, sourceType: "mouse" });
        expect(file.isFocused()).toBe(false);
        expect(edit.isFocused()).toBe(true);
      } finally {
        lumine.window.onDidRequestApplicationMenuPopupSwitch = originalSubscription;
      }
    });

    it("ignores a stale native hover request", async () => {
      configState.customMenus = false;
      spyOn(lumine.window, "showApplicationMenuPopup").and.returnValue(new Promise(() => {}));
      spyOn(lumine.window, "closeApplicationMenuPopup").and.resolveTo(true);
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      setNativeMenuBounds(appMenu);

      appMenu.getLabels()[0].getElement().click();
      await flushMicrotasks();
      const request = lumine.window.showApplicationMenuPopup.calls.mostRecent().args[0];
      const editTarget = request.hoverTargets.find((target) => target.id === "Edit");

      appMenu.onNativeMenuPopupSwitch({
        from: "an-older-session:submenu:0",
        target: switchEventTarget(editTarget),
      });
      await flushMicrotasks();

      expect(lumine.window.showApplicationMenuPopup).toHaveBeenCalledTimes(1);
      expect(appMenu.getLabels()[0].isFocused()).toBe(true);
    });

    it("names native hover sessions uniquely across application menu instances", async () => {
      configState.customMenus = false;
      spyOn(lumine.window, "showApplicationMenuPopup").and.returnValue(new Promise(() => {}));
      spyOn(lumine.window, "closeApplicationMenuPopup").and.resolveTo(true);
      const previousMenu = ApplicationMenu.createApplicationMenu(template, parent);

      try {
        setNativeMenuBounds(previousMenu);
        previousMenu.getLabels()[0].getElement().click();
        await flushMicrotasks();
        const previousRequest = lumine.window.showApplicationMenuPopup.calls.argsFor(0)[0];

        appMenu = ApplicationMenu.createApplicationMenu(template, parent);
        setNativeMenuBounds(appMenu);
        appMenu.getLabels()[0].getElement().click();
        await flushMicrotasks();
        const currentRequest = lumine.window.showApplicationMenuPopup.calls.argsFor(1)[0];

        expect(currentRequest.activeHoverTarget).not.toBe(previousRequest.activeHoverTarget);
        expect(currentRequest.hoverTargets.map((target) => target.key)).not.toEqual(
          previousRequest.hoverTargets.map((target) => target.key),
        );

        const previousEditTarget = previousRequest.hoverTargets.find(
          (target) => target.id === "Edit",
        );
        appMenu.onNativeMenuPopupSwitch({
          from: previousRequest.activeHoverTarget,
          target: switchEventTarget(previousEditTarget),
        });
        await flushMicrotasks();

        expect(lumine.window.showApplicationMenuPopup).toHaveBeenCalledTimes(2);
        expect(appMenu.getLabels()[0].isFocused()).toBe(true);
      } finally {
        previousMenu.destroy();
        previousMenu.getElement().remove();
      }
    });

    it("switches from a visible label to the native overflow popup", async () => {
      configState.customMenus = false;
      spyOn(lumine.window, "showApplicationMenuPopup").and.returnValue(new Promise(() => {}));
      spyOn(lumine.window, "closeApplicationMenuPopup").and.resolveTo(true);
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      appMenu.setOverflowStartIndex(1);
      setNativeMenuBounds(appMenu);

      appMenu.getLabels()[0].getElement().click();
      await flushMicrotasks();
      const firstRequest = lumine.window.showApplicationMenuPopup.calls.mostRecent().args[0];
      const overflowTarget = firstRequest.hoverTargets.find((target) => target.kind === "overflow");

      appMenu.onNativeMenuPopupSwitch({
        from: firstRequest.activeHoverTarget,
        target: switchEventTarget(overflowTarget),
      });
      await flushMicrotasks();

      expect(
        requestWithoutHoverMetadata(
          lumine.window.showApplicationMenuPopup.calls.mostRecent().args[0],
        ),
      ).toEqual({
        kind: "overflow",
        ids: ["Edit", "Help"],
        x: 48,
        y: 25,
        sourceType: "mouse",
      });
      expect(appMenu.overflowLabel.isFocused()).toBe(true);
    });

    it("disposes its native popup switch subscription", () => {
      const originalSubscription = lumine.window.onDidRequestApplicationMenuPopupSwitch;
      const subscription = jasmine.createSpyObj("nativePopupSwitchSubscription", ["dispose"]);
      lumine.window.onDidRequestApplicationMenuPopupSwitch = () => subscription;

      try {
        appMenu = ApplicationMenu.createApplicationMenu(template, parent);
        appMenu.destroy();
        expect(subscription.dispose).toHaveBeenCalledTimes(1);
      } finally {
        lumine.window.onDidRequestApplicationMenuPopupSwitch = originalSubscription;
      }
    });

    it("keeps a newer native session active when the previous popup settles", async () => {
      configState.customMenus = false;
      const popupResolvers = [];
      spyOn(lumine.window, "showApplicationMenuPopup").and.callFake(
        () =>
          new Promise((resolve) => {
            popupResolvers.push(resolve);
          }),
      );
      spyOn(lumine.window, "closeApplicationMenuPopup").and.resolveTo(true);
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      const [file, edit] = appMenu.getLabels();
      setNativeMenuBounds(appMenu, {
        File: { left: 1, top: 0, right: 2, bottom: 2 },
        Edit: { left: 3, top: 0, right: 5, bottom: 4 },
      });

      appMenu.openNativeMenu(file, "mouse");
      await flushMicrotasks();
      appMenu.openNativeMenu(edit, "mouse");
      await flushMicrotasks();
      popupResolvers[0](true);
      await flushMicrotasks();

      expect(edit.isFocused()).toBe(true);
      expect(file.isFocused()).toBe(false);

      popupResolvers[1](true);
      await flushMicrotasks();
      expect(edit.isFocused()).toBe(false);
    });

    it("cleans native state after a rejected popup without opening the HTML menu", async () => {
      configState.customMenus = false;
      spyOn(console, "error");
      spyOn(lumine.window, "showApplicationMenuPopup").and.rejectWith(new Error("window gone"));
      spyOn(lumine.window, "closeApplicationMenuPopup").and.returnValue(false);
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      const file = appMenu.getLabels()[0];
      setNativeMenuBounds(appMenu, {
        File: { left: 1, top: 0, right: 2, bottom: 2 },
      });

      const result = await appMenu.openNativeMenu(file, "mouse");

      expect(result).toBe(false);
      expect(file.isFocused()).toBe(false);
      expect(file.isOpen()).toBe(false);
      expect(appMenu.nativePopupPromise).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });

    it("closes a pending native popup on blur and on a live mode change", async () => {
      configState.customMenus = false;
      spyOn(lumine.window, "showApplicationMenuPopup").and.returnValue(new Promise(() => {}));
      spyOn(lumine.window, "closeApplicationMenuPopup").and.resolveTo(true);
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      const file = appMenu.getLabels()[0];
      setNativeMenuBounds(appMenu, {
        File: { left: 1, top: 0, right: 2, bottom: 2 },
      });

      appMenu.openNativeMenu(file, "mouse");
      await flushMicrotasks();
      appMenu.blur();
      await flushMicrotasks();
      expect(lumine.window.closeApplicationMenuPopup.calls.count()).toBe(1);
      expect(file.isFocused()).toBe(false);

      appMenu.openNativeMenu(file, "mouse");
      await flushMicrotasks();
      configState.customMenus = true;
      appMenu.onMenuModeChanged();
      await flushMicrotasks();
      expect(lumine.window.closeApplicationMenuPopup.calls.count()).toBe(2);
      expect(file.isFocused()).toBe(false);
    });

    it("cancels a deferred focus command when the menu mode changes", () => {
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);

      appMenu.focusMenuCommand();
      configState.customMenus = false;
      platform = "darwin";
      appMenu.onMenuModeChanged();
      advanceClock(1);

      expect(appMenu.getFocusedLabel()).toBeNull();
    });

    it("disables title-bar menu interaction when macOS uses its global menu", () => {
      configState.customMenus = false;
      configState.altGivesFocus = true;
      platform = "darwin";
      spyOn(lumine.window, "showApplicationMenuPopup");
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);

      appMenu.onKeyDown({ key: "Alt", repeat: false });
      appMenu.onKeyUp({ key: "Alt" });
      appMenu.focusMenuCommand();
      appMenu.getLabels()[0].getElement().click();

      expect(appMenu.canInteract()).toBe(false);
      expect(appMenu.getFocusedLabel()).toBeNull();
      expect(appMenu.showingAltKeys).toBe(false);
      expect(lumine.window.showApplicationMenuPopup).not.toHaveBeenCalled();
      expect(shouldUseGlobalApplicationMenu(false, "darwin")).toBe(true);
      expect(shouldUseGlobalApplicationMenu(false, "win32")).toBe(false);
      expect(shouldUseGlobalApplicationMenu(true, "darwin")).toBe(false);
    });

    it("includes the overflow label in keyboard navigation", () => {
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      appMenu.setOverflowStartIndex(1);

      appMenu.focusFirstLabel();
      expect(appMenu.getFocusedLabel().getLabelText()).toBe("&File");

      appMenu.focusNextLabel();
      expect(appMenu.getFocusedLabel().getLabelText()).toBe("...");

      appMenu.focusNextLabel();
      expect(appMenu.getFocusedLabel().getLabelText()).toBe("&File");
    });

    it("opens an overflowed menu through its mnemonic", () => {
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      appMenu.setOverflowStartIndex(1);
      appMenu.showAltKeys(true);

      const event = {
        key: "h",
        repeat: false,
        stopPropagation() {},
        preventDefault() {},
      };
      appMenu.onKeyDown(event);

      const helpItem = appMenu.overflowLabel.getSubmenu()[1];
      expect(appMenu.getOpenLabel()).toBe(appMenu.overflowLabel);
      expect(helpItem.isOpen()).toBe(true);
      expect(helpItem.getSubmenu().getSelected().getLabelText()).toBe("&About");
    });

    it("clears overflow state when the canonical menu changes", () => {
      appMenu = ApplicationMenu.createApplicationMenu(template, parent);
      appMenu.setOverflowStartIndex(1);

      appMenu.insertLabel(
        MenuLabel.createMenuLabel({
          label: "&View",
          submenu: [{ label: "Toggle", command: "example:toggle" }],
        }),
        1,
      );

      expect(appMenu.getOverflowStartIndex()).toBe(4);
      expect(appMenu.getNavigableLabels().length).toBe(4);
      expect(appMenu.overflowLabel.getSubmenu().length).toBe(0);
    });

    describe("alt-scroll cancelling menu activation", () => {
      const altDown = () => ({
        key: "Alt",
        repeat: false,
        stopPropagation() {},
        preventDefault() {},
      });
      const altUp = () => ({ key: "Alt", stopPropagation() {}, preventDefault() {} });

      beforeEach(() => {
        configState.altGivesFocus = true;
        // Alt-wheel amplification enabled unless a test overrides it.
        lumine.config.set("editor.altWheelMultiplier", 7.5);
      });

      it("focuses the first label when Alt is tapped without an intervening scroll", () => {
        appMenu = ApplicationMenu.createApplicationMenu(template, parent);

        appMenu.onKeyDown(altDown());
        appMenu.onKeyUp(altUp());

        expect(appMenu.getFocusedLabel()?.getLabelText()).toBe("&File");
      });

      it("does not focus the menu when an alt-scroll happens during the Alt hold", () => {
        appMenu = ApplicationMenu.createApplicationMenu(template, parent);

        appMenu.onKeyDown(altDown());
        appMenu.onWheel({ altKey: true });
        appMenu.onKeyUp(altUp());

        expect(appMenu.getFocusedLabel()).toBeNull();
        expect(appMenu.showingAltKeys).toBe(false);
      });

      it("still activates the menu when the alt-wheel multiplier is disabled", () => {
        lumine.config.set("editor.altWheelMultiplier", 1);
        appMenu = ApplicationMenu.createApplicationMenu(template, parent);

        appMenu.onKeyDown(altDown());
        appMenu.onWheel({ altKey: true });
        appMenu.onKeyUp(altUp());

        expect(appMenu.getFocusedLabel()?.getLabelText()).toBe("&File");
      });

      it("ignores wheel events without the Alt modifier", () => {
        appMenu = ApplicationMenu.createApplicationMenu(template, parent);

        appMenu.onKeyDown(altDown());
        appMenu.onWheel({ altKey: false });
        appMenu.onKeyUp(altUp());

        expect(appMenu.getFocusedLabel()?.getLabelText()).toBe("&File");
      });
    });
  });
});
