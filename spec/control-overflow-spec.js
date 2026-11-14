const { ipcRenderer } = require("electron");

async function nativePointer(type, element) {
  const rect = element.getBoundingClientRect();
  await ipcRenderer.invoke("lumine:window", "sendInputEvent", {
    type,
    x: Math.floor(rect.left + rect.width / 2),
    y: Math.floor(rect.top + rect.height / 2),
    button: "left",
    clickCount: 1,
  });
}

async function nativeHover(element) {
  const deadline = Date.now() + 3000;
  do {
    await nativePointer("mouseMove", element);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (element.matches(":hover")) return;
  } while (Date.now() < deadline);
  throw new Error(`Native hover did not reach ${element.id || element.className}`);
}

async function nativeKey(keyCode) {
  for (const type of ["keyDown", "keyUp"]) {
    await ipcRenderer.invoke("lumine:window", "sendInputEvent", { type, keyCode });
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

describe("Title bar control overflow", () => {
  let view;
  let popup;

  beforeEach(async () => {
    jasmine.useRealClock();
    await lumine.packages.activatePackage("title-bar");
  });

  afterEach(() => {
    popup?.close({ restoreFocus: false });
    popup = null;
    view?.deactivate();
    view = null;
  });

  function createView({ theme = "Windows 11", platform = "win32", width = 680 } = {}) {
    // A previous lifecycle spec may have unloaded the package's modules.
    const { TitleBarView } = require("../lib/view");
    const { Config } = require("../lib/types");
    const config = new Config();
    config.windowControlTheme = theme;
    view = new TitleBarView(config, { platform });
    Object.assign(view.element.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: `${width}px`,
      zIndex: "100000",
    });
    view.element.style.setProperty("--title-bar-transition-normal", "0s");
    view.element.style.setProperty("--title-bar-transition-slow", "0s");
    view.chrome.setTitle("Signal Lab project");
    jasmine.attachToDOM(view.element);
    return view;
  }

  function addTiles(count = 10, tag = "button") {
    return Array.from({ length: count }, (_, index) => {
      const element = document.createElement(tag);
      if (tag === "button") element.type = "button";
      element.setAttribute("aria-label", `Control ${index + 1}`);
      element.textContent = String(index + 1);
      element.style.width = "40px";
      element.style.flexShrink = "0";
      return view.getControlTiles().addItem({ item: element, priority: index });
    });
  }

  async function settled(predicate, description) {
    await waitForFrames(predicate, { frames: 120, description });
  }

  async function withQuickLayout(options, exercise) {
    const packages = ["one-theme", "one-day-ui", "quick-layout"];
    const activeBefore = new Set(packages.filter((name) => lumine.packages.isPackageActive(name)));
    const settings = ["showDockButtons", "showLayoutButtons", "showFullScreenButton"];
    const values = new Map(
      settings.map((name) => [name, lumine.config.get(`quick-layout.${name}`)]),
    );
    let contribution;
    const parking = document.createElement("div");
    parking.style.cssText = "position:fixed;left:0;top:100px;width:20px;height:20px;z-index:100001";
    jasmine.attachToDOM(parking);

    try {
      for (const name of packages) await lumine.packages.activatePackage(name);
      for (const name of settings) lumine.config.set(`quick-layout.${name}`, true);
      createView(options);
      if (options.title) view.chrome.setTitle(options.title);
      const editorWindow = lumine.workspace.getMainWindow();
      const quickLayout = lumine.packages.getActivePackage("quick-layout").mainModule;
      contribution = quickLayout.consumeWindowTitleBar(view.getControlTiles(), {
        window: editorWindow,
        document,
        workspace: lumine.workspace,
        editorContainer: editorWindow.getEditorContainer(),
      });
      view.layout();
      const tile = view.controlTilesElement.querySelector("#quick-layout-toggle-left-dock");
      expect(tile).toExist();
      await exercise({ tile, parking, editorWindow });
    } finally {
      contribution?.dispose();
      for (const [name, value] of values) {
        if (value === undefined) lumine.config.unset(`quick-layout.${name}`);
        else lumine.config.set(`quick-layout.${name}`, value);
      }
      for (const name of packages.toReversed()) {
        if (!activeBefore.has(name)) await lumine.packages.deactivatePackage(name);
      }
      parking.remove();
    }
  }

  for (const [theme, platform] of [
    ["Windows 11", "win32"],
    ["GNOME", "win32"],
    ["macOS Tahoe", "win32"],
    ["macOS Tahoe", "darwin"],
  ]) {
    it(`reveals the original controls over the title with ${theme} on ${platform}`, async () => {
      createView({ theme, platform });
      const tiles = addTiles();
      const row = view.controlTilesElement;
      const overflow = view.controlOverflow;
      view.layout();
      expect(overflow.collapsed).toBe(true);
      expect(overflow.button.getAttribute("aria-expanded")).toBe("false");
      const trigger = overflow.button.getBoundingClientRect();
      const click = jasmine.createSpy("original tile click");
      tiles[0].getItem().addEventListener("click", click);

      overflow.button.click();
      await settled(
        () => overflow.expanded && Number(getComputedStyle(view.titleElement).opacity) === 0,
        "the expanded controls hide the title",
      );
      expect(overflow.button.getAttribute("aria-expanded")).toBe("true");
      expect(row.closest(".title-bar")).toBe(view.element);
      expect(Array.from(row.children)).toEqual(tiles.map((tile) => tile.getItem()));
      expect(overflow.button.getBoundingClientRect().left).toBeCloseTo(trigger.left, 1);
      expect(overflow.button.getBoundingClientRect().right).toBeCloseTo(trigger.right, 1);
      const viewport = overflow.viewport.getBoundingClientRect();
      const logo = view.appIcon.getBoundingClientRect();
      const controls = view.chrome.windowButtonsElement.getBoundingClientRect();
      expect(viewport.top).toBeLessThan(view.titleElement.getBoundingClientRect().bottom);
      if (theme === "macOS Tahoe") {
        expect(viewport.left).toBeGreaterThanOrEqual(controls.right);
        expect(viewport.right).toBeLessThanOrEqual(logo.left);
      } else {
        expect(viewport.left).toBeGreaterThanOrEqual(logo.right);
        expect(viewport.right).toBeLessThanOrEqual(controls.left);
      }
      tiles[0].getItem().click();
      expect(click).toHaveBeenCalledTimes(1);
      expect(overflow.expanded).toBe(true);

      overflow.button.click();
      await settled(
        () => !overflow.expanded && Number(getComputedStyle(view.titleElement).opacity) === 1,
        "the collapsed controls restore the title",
      );
    });
  }

  it("returns to the full strip after widening without replacing any tile", async () => {
    createView();
    const tiles = addTiles();
    view.layout();
    view.controlOverflow.button.click();
    expect(view.controlOverflow.expanded).toBe(true);

    view.element.style.width = "1600px";
    await settled(() => !view.controlOverflow.collapsed, "the full control strip fits again");
    expect(view.controlOverflow.expanded).toBe(false);
    expect(Array.from(view.controlTilesElement.children)).toEqual(
      tiles.map((tile) => tile.getItem()),
    );
    expect(view.controlTilesElement.inert).toBe(false);
    expect(getComputedStyle(view.controlOverflow.button).display).toBe("none");
  });

  it("keeps long titles clear of the toggle without oscillating between layouts", async () => {
    createView({ theme: "macOS Tahoe", platform: "darwin" });
    addTiles(3);
    view.chrome.setTitle("Signal Lab project with a long descriptive title ".repeat(8));
    view.layout();
    const overflow = view.controlOverflow;
    expect(overflow.collapsed).toBe(true);
    const toggle = overflow.button.getBoundingClientRect();
    const title = view.titleElement.getBoundingClientRect();
    expect(title.left).toBeGreaterThanOrEqual(toggle.right);
    expect(title.right).toBeLessThanOrEqual(view.appIcon.getBoundingClientRect().left);
    for (let frame = 0; frame < 5; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      view.layout();
      expect(overflow.collapsed).toBe(true);
    }
    expect(getComputedStyle(view.titleElement).textOverflow).toBe("ellipsis");
  });

  it("preserves editor focus when the pointer toggles controls", () => {
    const editor = document.createElement("input");
    jasmine.attachToDOM(editor);
    createView();
    addTiles();
    view.layout();
    editor.focus();
    const button = view.controlOverflow.button;
    for (const expanded of [true, false]) {
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
      button.dispatchEvent(down);
      expect(down.defaultPrevented).toBe(true);
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, detail: 1 }));
      expect(view.controlOverflow.expanded).toBe(expanded);
      expect(document.activeElement).toBe(editor);
    }
  });

  it("reflows when controls are added, resized, hidden and removed", async () => {
    createView({ width: 900 });
    const tiles = addTiles(1);
    view.layout();
    expect(view.controlOverflow.collapsed).toBe(false);
    tiles.push(...addTiles(9));
    await settled(() => view.controlOverflow.collapsed, "new controls cause overflow");
    for (const tile of tiles) tile.getItem().style.width = "8px";
    await settled(() => !view.controlOverflow.collapsed, "smaller controls fit");
    for (const tile of tiles) tile.getItem().style.width = "60px";
    await settled(() => view.controlOverflow.collapsed, "larger controls cause overflow");
    for (const tile of tiles) tile.getItem().style.display = "none";
    await settled(() => !view.controlOverflow.collapsed, "hidden controls need no space");
    for (const tile of tiles) tile.destroy();
    await settled(
      () => getComputedStyle(view.controlOverflow.button).display === "none",
      "an empty strip has no overflow button",
    );
  });

  it("allows scrolling all controls in an exceptionally narrow window", async () => {
    createView({ width: 420 });
    addTiles(20);
    view.layout();
    view.controlOverflow.button.click();
    const viewport = view.controlOverflow.viewport;
    await settled(
      () => viewport.clientWidth > 0 && viewport.scrollWidth > viewport.clientWidth,
      "the expanded strip scrolls within its available space",
    );
    const before = viewport.scrollLeft;
    viewport.scrollLeft = viewport.scrollWidth;
    expect(viewport.scrollLeft).toBeGreaterThan(before);
    expect(view.chrome.windowButtonsElement.getBoundingClientRect().right).toBeCloseTo(420, 1);
  });

  it("keeps shared scrollbar chrome out of the animated strip while retaining scrolling", async () => {
    createView({ width: 420 });
    addTiles(20);
    view.element.style.setProperty("--title-bar-transition-slow", "500ms");
    view.layout();
    const overflow = view.controlOverflow;
    const manager = lumine.scrollbars.forDocument(document);
    const witness = document.createElement("div");
    witness.style.cssText = "position:fixed;left:0;top:100px;width:100px;height:40px;overflow:auto";
    const content = document.createElement("div");
    content.style.cssText = "width:400px;height:80px";
    witness.appendChild(content);
    jasmine.attachToDOM(witness);
    const unexpectedChrome = [];
    const chromeSelector = ".lumine-scrollbar, .lumine-scrollbar-overlay";
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node.nodeType === 1 &&
            (node.matches(chromeSelector) || node.querySelector(chromeSelector))
          ) {
            unexpectedChrome.push(node);
          }
        }
      }
    });
    observer.observe(overflow.slot, { childList: true, subtree: true });
    const expectNoChrome = () => {
      expect(overflow.slot.querySelector(chromeSelector)).toBeNull();
      expect(manager.controllers.has(overflow.viewport)).toBe(false);
      expect(manager.controllers.has(view.controlTilesElement)).toBe(false);
    };

    try {
      // Prove discovery is active rather than passing because the renderer's
      // shared manager was absent from this spec window.
      await settled(
        () => manager.controllers.has(witness),
        "shared scrollbars discover a real scrollport",
      );
      expect(witness.classList.contains("lumine-scrollport")).toBe(true);
      let intermediateFrames = 0;
      let finished = false;
      overflow.open();
      for (let frame = 0; frame < 120; frame++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expectNoChrome();
        const width = overflow.viewport.getBoundingClientRect().width;
        const finalWidth = parseFloat(
          overflow.slot.style.getPropertyValue("--control-tiles-expanded-width"),
        );
        if (width > 0 && width < finalWidth - 0.5) intermediateFrames++;
        if (width > 0 && Math.abs(width - finalWidth) < 0.5) {
          finished = true;
          break;
        }
      }
      expect(intermediateFrames).toBeGreaterThan(0);
      expect(finished).toBe(true);
      expect(unexpectedChrome.length).toBe(0);
      expectNoChrome();
      const viewport = overflow.viewport;
      expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
      viewport.scrollLeft = viewport.scrollWidth;
      expect(viewport.scrollLeft).toBeGreaterThan(0);
      viewport.scrollLeft = 0;
      viewport.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 80, bubbles: true, cancelable: true }),
      );
      expect(viewport.scrollLeft).toBeGreaterThan(0);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expectNoChrome();
      expect(unexpectedChrome.length).toBe(0);
    } finally {
      observer.disconnect();
      manager.controllers.get(witness)?.dispose();
      witness.remove();
    }
  });

  it("highlights and clicks real Quick Layout controls through native pointer input", async () => {
    await withQuickLayout({}, async ({ tile, parking, editorWindow }) => {
      expect(view.controlOverflow.collapsed).toBe(true);
      view.controlOverflow.open();
      for (const wrapper of [view.controlOverflow.slot, view.controlOverflow.viewport])
        expect(getComputedStyle(wrapper).getPropertyValue("-webkit-app-region")).toBe("no-drag");
      await settled(
        () =>
          view.controlOverflow.viewport.clientWidth > 0 && getComputedStyle(tile).opacity === "1",
        "the original Quick Layout controls are revealed",
      );
      await nativeHover(parking);
      const restingColor = getComputedStyle(tile).backgroundColor;
      await nativeHover(tile);
      expect(tile.matches(":hover")).toBe(true);
      expect(getComputedStyle(tile).backgroundColor).not.toBe(restingColor);
      expect(getComputedStyle(tile).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      const dispatch = spyOn(lumine.commands, "dispatch").and.returnValue(true);
      const before = await editorWindow.getState();
      await nativePointer("mouseDown", tile);
      await nativePointer("mouseUp", tile);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(
        dispatch.calls.allArgs().filter((args) => args[1] === "quick-layout:toggle-left-dock"),
      ).toEqual([[editorWindow.getElement(), "quick-layout:toggle-left-dock"]]);
      expect(view.controlOverflow.expanded).toBe(true);
      const after = await editorWindow.getState();
      expect(after.position).toEqual(before.position);
      expect(after.size).toEqual(before.size);
    });
  });

  it("hides the normal Quick Layout strip after pointer activation without focusing its tiles", async () => {
    await withQuickLayout({ width: 900, title: "Lab" }, async ({ tile, parking, editorWindow }) => {
      expect(view.controlOverflow.collapsed).toBe(false);
      const editor = document.createElement("input");
      jasmine.attachToDOM(editor);
      editor.focus();
      await nativeHover(tile);
      await settled(
        () => getComputedStyle(tile).opacity === "1",
        "the pointer reveals Quick Layout",
      );
      const dispatch = spyOn(lumine.commands, "dispatch").and.returnValue(true);
      await nativePointer("mouseDown", tile);
      await nativePointer("mouseUp", tile);
      await nativeHover(parking);
      expect(document.activeElement).not.toBe(tile);
      expect(view.controlTilesElement.matches(":focus-within")).toBe(false);
      expect(view.controlTilesElement.matches(":hover")).toBe(false);
      await settled(
        () => getComputedStyle(tile).opacity === "0",
        "the normal strip hides after the pointer leaves",
      );
      expect(
        dispatch.calls.allArgs().filter((args) => args[1] === "quick-layout:toggle-left-dock"),
      ).toEqual([[editorWindow.getElement(), "quick-layout:toggle-left-dock"]]);
    });
  });

  it("preserves package-owned native controls and explicit keyboard semantics", async () => {
    createView({ width: 900 });
    view.chrome.setTitle("Lab");
    const explicit = document.createElement("title-bar-tile");
    explicit.tabIndex = 0;
    explicit.setAttribute("role", "button");
    explicit.textContent = "Package action";
    explicit.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      explicit.click();
    });
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Native action";
    const controls = [explicit, button];
    for (const item of controls) view.getControlTiles().addItem({ item });
    view.layout();
    expect(view.controlOverflow.collapsed).toBe(false);
    const click = jasmine.createSpy("package control click");
    explicit.addEventListener("click", click);
    explicit.focus();
    await nativeKey("Enter");
    await nativeKey(" ");
    expect(click).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(explicit);
    button.focus();
    expect(document.activeElement).toBe(button);
    view.deactivate();
    view = null;
    expect(explicit.getAttribute("role")).toBe("button");
    expect(explicit.getAttribute("tabindex")).toBe("0");
    expect(button.hasAttribute("role")).toBe(false);
    expect(button.hasAttribute("tabindex")).toBe(false);
  });

  it("preserves native pointer focus and activation inside a compound tile", async () => {
    createView({ width: 900 });
    view.chrome.setTitle("Lab");
    const item = document.createElement("title-bar-tile");
    const input = document.createElement("input");
    input.style.width = "70px";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Action";
    // Compound controls paint above the tile's full-height edge hit layer.
    for (const control of [input, button]) {
      control.style.position = "relative";
      control.style.zIndex = "1";
    }
    item.append(input, button);
    view.getControlTiles().addItem({ item });
    view.layout();
    await settled(() => input.getBoundingClientRect().width > 0, "the compound tile is laid out");
    expect(view.controlOverflow.collapsed).toBe(false);
    expect(item.hasAttribute("tabindex")).toBe(false);
    const click = jasmine.createSpy("native button click");
    button.addEventListener("click", click);
    for (const control of [input, button]) {
      await nativeHover(control);
      await nativePointer("mouseDown", control);
      await nativePointer("mouseUp", control);
      expect(document.activeElement).toBe(control);
    }
    await settled(() => click.calls.count() === 1, "the native button click is delivered");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("keeps a tile's popup usable and lets Escape dismiss the popup first", async () => {
    createView();
    const tiles = addTiles();
    view.layout();
    view.controlOverflow.button.click();
    const tile = tiles[0].getItem();
    popup = lumine.menu.showPopup({
      anchor: tile,
      ownerElement: tile,
      target: lumine.workspace.getElement(),
      template: [{ label: "Toggle Control", command: "title-bar:toggle" }],
      autoSelectFirstItem: true,
    });
    const surface = popup.handle.surface;
    surface.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.controlOverflow.expanded).toBe(true);
    expect(popup.closed).toBe(false);
    surface.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(popup.closed).toBe(true);
    expect(view.controlOverflow.expanded).toBe(true);
    view.controlOverflow.button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(view.controlOverflow.expanded).toBe(false);
  });

  it("dismisses on an outside click and window blur", () => {
    createView();
    addTiles();
    view.layout();
    view.controlOverflow.button.click();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(view.controlOverflow.expanded).toBe(false);
    view.controlOverflow.button.click();
    window.dispatchEvent(new Event("blur"));
    expect(view.controlOverflow.expanded).toBe(false);
  });

  it("leaves plain tiles without added roles or tab stops throughout their lifecycle", async () => {
    createView();
    const tiles = addTiles(10, "title-bar-tile");
    const expectPlain = () => {
      for (const tile of tiles) {
        expect(tile.getItem().hasAttribute("role")).toBe(false);
        expect(tile.getItem().hasAttribute("tabindex")).toBe(false);
      }
    };
    expectPlain();
    view.layout();
    view.controlOverflow.open({ focus: true });
    await settled(() => view.controlOverflow.expanded, "the strip is revealed");
    expectPlain();
    const click = jasmine.createSpy("plain tile click");
    const item = tiles[0].getItem();
    item.addEventListener("click", click);
    for (const key of ["Enter", " "]) {
      item.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    expect(click).not.toHaveBeenCalled();
    tiles.push(...addTiles(1, "title-bar-tile"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expectPlain();
    view.controlOverflow.close();
    expectPlain();
    view.deactivate();
    view = null;
    expectPlain();
  });
});
