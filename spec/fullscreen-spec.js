describe("Title bar in full screen", () => {
  let fixtures;

  beforeEach(async () => {
    jasmine.useRealClock();
    fixtures = [];
    await lumine.packages.activatePackage("title-bar");
  });

  afterEach(() => {
    for (const { view, events } of fixtures) {
      view.deactivate();
      events.dispose();
    }
  });

  async function createView({
    theme = "Windows 11",
    platform = "win32",
    width = 1000,
    fullScreen = false,
  } = {}) {
    // Lifecycle specs can unload the package, so use its current generation.
    const { TitleBarView } = require("../lib/view");
    const { Config } = require("../lib/types");
    const { Emitter } = require("lumine");
    const events = new Emitter();
    const state = { fullScreen, maximized: false, visible: true };
    const mainWindow = lumine.workspace.getMainWindow();
    // Native state is supplied by an independent controller for each view;
    // no test enters full screen or changes the user's actual native window.
    const editorWindow = {
      getDocument: () => document,
      getElement: () => mainWindow.getElement(),
      getEditorContainer: () => mainWindow.getEditorContainer(),
      isMain: () => true,
      getState: async () => ({ ...state }),
      onDidMaximize: (callback) => events.on("maximize", callback),
      onDidUnmaximize: (callback) => events.on("unmaximize", callback),
      onDidEnterFullScreen: (callback) => events.on("enter-full-screen", callback),
      onDidLeaveFullScreen: (callback) => events.on("leave-full-screen", callback),
      onDidFocus: (callback) => events.on("focus", callback),
      onDidBlur: (callback) => events.on("blur", callback),
      setSheetOffset: jasmine.createSpy("setSheetOffset").and.resolveTo(),
      maximize: jasmine.createSpy("maximize").and.resolveTo(),
      unmaximize: jasmine.createSpy("unmaximize").and.resolveTo(),
    };
    const config = new Config();
    config.autoHide = false;
    config.windowControlTheme = theme;
    const view = new TitleBarView(config, { platform, editorWindow });
    const fixture = {
      view,
      events,
      editorWindow,
      async setFullScreen(value) {
        state.fullScreen = value;
        events.emit(value ? "enter-full-screen" : "leave-full-screen");
        await waitForFrames(() => view.chrome.windowState.fullscreen === value, {
          description: `the title bar receives full screen state ${value}`,
        });
        view.layout();
      },
    };
    fixtures.push(fixture);
    Object.assign(view.element.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: `${width}px`,
      zIndex: "100000",
    });
    view.element.style.setProperty("--title-bar-transition-normal", "0s");
    view.element.style.setProperty("--title-bar-transition-slow", "0s");
    view.chrome.setTitle("Fullscreen");
    jasmine.attachToDOM(view.element);
    await view.chrome.syncWindowState();
    view.layout();
    return fixture;
  }

  function addTile(view, width = 32) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "A";
    button.style.width = `${width}px`;
    view.getControlTiles().addItem({ item: button, priority: 0 });
    return button;
  }

  function expectVisible(element) {
    expect(element.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(element.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(getComputedStyle(element).visibility).toBe("visible");
    expect(Number(getComputedStyle(element).opacity)).toBeGreaterThan(0);
  }

  function expectWindowButtonsHidden(view) {
    const container = view.chrome.windowButtonsElement;
    expect(getComputedStyle(container).display).toBe("none");
    expect(container.getBoundingClientRect().width).toBe(0);
    for (const button of Object.values(view.windowControls)) {
      expect(button.getClientRects().length).toBe(0);
    }
  }

  for (const platform of ["win32", "linux", "darwin"]) {
    for (const theme of ["Windows 11", "GNOME", "macOS Tahoe"]) {
      it(`keeps the ${theme} bar usable without window buttons on ${platform}`, async () => {
        const fixture = await createView({ theme, platform });
        const { view, editorWindow } = fixture;
        const tile = addTile(view);
        const click = jasmine.createSpy("tile click");
        tile.addEventListener("click", click);
        view.layout();
        const originalHeight = view.element.getBoundingClientRect().height;
        expectVisible(view.chrome.windowButtonsElement);

        await fixture.setFullScreen(true);

        expect(view.isTitleBarVisible()).toBeTrue();
        expectVisible(view.element);
        expect(view.element.getBoundingClientRect().height).toBe(originalHeight);
        expectWindowButtonsHidden(view);
        for (const element of [view.appIcon, view.titleElement, tile]) expectVisible(element);
        expect(view.controlOverflow.collapsed).toBeFalse();
        tile.click();
        expect(click).toHaveBeenCalledTimes(1);
        const menu = view.getMenuBar();
        if (platform === "darwin") {
          expect(menu).toBeNull();
        } else {
          expectVisible(menu.element);
          expect(menu.element.classList.contains("no-menu-bar")).toBeFalse();
          expectVisible(
            menu.element.querySelector(".menu-label:not(.overflow-menu-label):not(.overflowed)"),
          );
        }
        await view.chrome.toggleMaximized();
        expect(editorWindow.maximize).not.toHaveBeenCalled();
        expect(editorWindow.unmaximize).not.toHaveBeenCalled();

        await fixture.setFullScreen(false);

        expect(view.isTitleBarVisible()).toBeTrue();
        expectVisible(view.chrome.windowButtonsElement);
        for (const button of Object.values(view.windowControls)) expectVisible(button);
        expect(view.windowControls.maximize.classList.contains("disabled")).toBeFalse();
        expectVisible(tile);
      });
    }

    it(`preserves manual visibility and allows toggling the bar in full screen on ${platform}`, async () => {
      const fixture = await createView({ platform });
      const { view } = fixture;
      view.setTitleBarVisible(false);

      await fixture.setFullScreen(true);

      expect(view.isTitleBarVisible()).toBeFalse();
      expect(getComputedStyle(view.element).display).toBe("none");
      view.setTitleBarVisible(true);
      expectVisible(view.element);
      expectWindowButtonsHidden(view);
      view.setTitleBarVisible(false);

      await fixture.setFullScreen(false);

      expect(view.isTitleBarVisible()).toBeFalse();
      expect(getComputedStyle(view.element).display).toBe("none");
      view.setTitleBarVisible(true);
      expectVisible(view.element);
      expectVisible(view.chrome.windowButtonsElement);
    });
  }

  it("applies an initially full screen window state before the first transition", async () => {
    const { view } = await createView({ fullScreen: true });

    expectVisible(view.element);
    expectWindowButtonsHidden(view);
  });

  it("keeps each window's full screen state independent", async () => {
    const first = await createView();
    const second = await createView();

    await first.setFullScreen(true);

    expectWindowButtonsHidden(first.view);
    expectVisible(second.view.chrome.windowButtonsElement);
    await second.setFullScreen(true);
    await first.setFullScreen(false);

    expectVisible(first.view.chrome.windowButtonsElement);
    expectWindowButtonsHidden(second.view);
    expectVisible(first.view.element);
    expectVisible(second.view.element);
  });

  it("preserves menu auto-hide and logo reveal in full screen", async () => {
    const fixture = await createView();
    const { view } = fixture;
    const menu = view.getMenuBar();
    view.setAutoHide(true);
    menu.blur();

    await fixture.setFullScreen(true);

    expect(view.getConfigState().autoHide).toBeTrue();
    expect(menu.element.classList.contains("no-menu-bar")).toBeTrue();
    view.appIcon.dispatchEvent(new MouseEvent("mouseenter"));
    expect(menu.element.classList.contains("no-menu-bar")).toBeFalse();
    expectVisible(menu.element);
    menu.blur();
    expect(menu.element.classList.contains("no-menu-bar")).toBeTrue();
    expectVisible(view.element);
  });

  for (const theme of ["Windows 11", "macOS Tahoe"]) {
    it(`uses the space released by ${theme} window buttons for control tiles`, async () => {
      const fixture = await createView({ theme, width: 480 });
      const { view } = fixture;
      const tiles = Array.from({ length: 4 }, () => addTile(view, 40));
      view.layout();
      expect(view.controlOverflow.collapsed).toBeTrue();
      expect(view.controlOverflow.button.hidden).toBeFalse();

      await fixture.setFullScreen(true);

      expect(view.controlOverflow.collapsed).toBeFalse();
      expect(view.controlOverflow.button.hidden).toBeTrue();
      for (const tile of tiles) expectVisible(tile);

      await fixture.setFullScreen(false);

      expect(view.controlOverflow.collapsed).toBeTrue();
      expect(view.controlOverflow.button.hidden).toBeFalse();
      expect(view.controlOverflow.viewport.inert).toBeTrue();
    });
  }
});
