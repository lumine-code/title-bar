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

  it("makes plain tile controls operable with the keyboard without double activation", async () => {
    createView();
    const tiles = addTiles(10, "title-bar-tile");
    const tile = tiles[0].getItem();
    const click = jasmine.createSpy("tile click");
    tile.addEventListener("click", click);
    view.layout();
    view.controlOverflow.open({ focus: true });
    await settled(() => tile.tabIndex >= 0, "plain control tiles can receive keyboard focus");
    tile.focus();
    for (const key of ["Enter", " "]) {
      tile.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      tile.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
    }
    expect(click).toHaveBeenCalledTimes(2);
    expect(view.controlOverflow.expanded).toBe(true);
  });
});
