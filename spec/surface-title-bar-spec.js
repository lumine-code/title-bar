const { Emitter } = require("lumine");
const { createPrimaryController } = require("../lib/primary-controller");
const { TitleBarChrome } = require("../lib/title-bar-chrome");

function controller() {
  const emitter = new Emitter();
  const calls = [];
  const state = {
    bounds: { x: 10, y: 20, width: 800, height: 600 },
    fullScreen: false,
    maximized: false,
    visible: true,
  };
  return {
    calls,
    state,
    getState: () => ({ ...state, bounds: { ...state.bounds } }),
    onDidChangeState: (callback) => emitter.on("state", callback),
    onDidFocus: (callback) => emitter.on("focus", callback),
    onDidBlur: (callback) => emitter.on("blur", callback),
    emitState(nextState) {
      Object.assign(state, nextState);
      emitter.emit("state", { ...state, bounds: { ...state.bounds } });
    },
    emitFocus() {
      emitter.emit("focus");
    },
    emitBlur() {
      emitter.emit("blur");
    },
    focus: () => calls.push("focus"),
    minimize: () => calls.push("minimize"),
    maximize() {
      calls.push("maximize");
      state.maximized = true;
    },
    unmaximize() {
      calls.push("unmaximize");
      state.maximized = false;
    },
    requestClose: () => calls.push("request-close"),
    setBounds(bounds) {
      calls.push(["set-bounds", bounds]);
      state.bounds = { ...bounds };
    },
    destroy: () => emitter.dispose(),
  };
}

describe("title-bar.surface service", () => {
  let pack,
    factory,
    frames,
    handles,
    controllers,
    styleMounts,
    contextMenuItems,
    originalShowForEvent,
    originalShowForSurfaceEvent;

  beforeEach(async () => {
    await Promise.resolve(lumine.packages.deactivatePackage("title-bar"));
    originalShowForEvent = lumine.contextMenu.showForEvent;
    originalShowForSurfaceEvent = lumine.contextMenu.showForSurfaceEvent;
    lumine.config.set("core.titleBar", "native");
    lumine.config.set("title-bar.customContextMenus", true);
    pack = await lumine.packages.activatePackage("title-bar");
    factory = pack.mainModule.provideSurfaceTitleBar();
    frames = [];
    handles = [];
    controllers = [];
    styleMounts = [];
  });

  afterEach(async () => {
    contextMenuItems?.dispose();
    for (const handle of handles) handle.destroy();
    for (const item of controllers) item.destroy();
    for (const mount of styleMounts) mount.dispose();
    for (const frame of frames) frame.remove();
    lumine.config.set("title-bar.controlTheme", "Default");
    await Promise.resolve(lumine.packages.deactivatePackage("title-bar"));
    lumine.config.set("core.titleBar", "custom");
  });

  function createSurface(name, action) {
    const frame = document.createElement("iframe");
    jasmine.attachToDOM(frame);
    frames.push(frame);
    styleMounts.push(lumine.styles.mount(frame.contentDocument));
    const windowController = controller();
    controllers.push(windowController);
    const handle = factory.create({
      document: frame.contentDocument,
      controller: windowController,
      title: name,
      actions: [
        {
          id: "attach",
          label: `Attach ${name}`,
          iconName: "pin",
          priority: -100,
          onDidActivate: action,
        },
      ],
      onDidActivateAppIcon: () => windowController.calls.push("app-icon"),
    });
    handles.push(handle);
    frame.contentDocument.body.appendChild(handle.element);
    return { frame, handle, controller: windowController };
  }

  it("is available when the primary window uses its native title bar", () => {
    expect(pack.mainModule.provideTitleBar()).toBeUndefined();
    expect(factory).toBeDefined();
    expect(typeof factory.create).toBe("function");
  });

  it("keeps custom context menus active in surfaces with a native primary title bar", () => {
    contextMenuItems = lumine.contextMenu.add({
      ".surface-title-bar-action": [
        { label: "Surface action", command: "title-bar-spec:surface-action" },
      ],
    });
    const surface = createSurface("Native primary", () => {});
    const target = surface.handle.element.querySelector('[data-action="attach"]');
    const showNativeMenu = jasmine.createSpy("showNativeMenu");

    lumine.contextMenu.showForSurfaceEvent(
      { target, clientX: 12, clientY: 24 },
      { windowService: { showContextMenu: showNativeMenu } },
    );

    const menu = surface.frame.contentDocument.querySelector(".context-menu-container");
    expect(menu).not.toBeNull();
    expect(menu.ownerDocument).toBe(surface.frame.contentDocument);
    expect(document.querySelector(".context-menu-container")).toBeNull();
    expect(showNativeMenu).not.toHaveBeenCalled();
  });

  it("restores both native context-menu routes when the package deactivates", async () => {
    expect(lumine.contextMenu.showForEvent).not.toBe(originalShowForEvent);
    expect(lumine.contextMenu.showForSurfaceEvent).not.toBe(originalShowForSurfaceEvent);

    await Promise.resolve(lumine.packages.deactivatePackage("title-bar"));

    expect(lumine.contextMenu.showForEvent).toBe(originalShowForEvent);
    expect(lumine.contextMenu.showForSurfaceEvent).toBe(originalShowForSurfaceEvent);
  });

  it("creates two independent realm-local chrome instances without primary menu side effects", async () => {
    const menuUpdate = lumine.menu.update;
    const contextMenuShow = lumine.contextMenu.showForEvent;
    const portalCount = document.querySelectorAll(".app-menu-submenu-portal").length;
    const firstAction = jasmine.createSpy("firstAction");
    const secondAction = jasmine.createSpy("secondAction");
    const first = createSurface("First", firstAction);
    const second = createSurface("Second", secondAction);

    for (const surface of [first, second]) {
      const { contentDocument, contentWindow } = surface.frame;
      expect(surface.handle.element.ownerDocument).toBe(contentDocument);
      expect(surface.handle.element instanceof contentWindow.HTMLElement).toBe(true);
      expect(surface.handle.element.querySelector(".app-menu")).toBeNull();
      expect(contentDocument.querySelector(".app-menu-submenu-portal")).toBeNull();
      const action = surface.handle.element.querySelector('[data-action="attach"]');
      expect(action.ownerDocument).toBe(contentDocument);
      expect(action.getAttribute("role")).toBe("button");
      expect(action.tabIndex).toBe(0);
      expect(action.classList).toContain("title-bar-item");
    }
    const chrome = [...factory.instances][0].chrome;
    const tile = chrome.controlTiles.getTiles()[0];
    expect(tile.stamp.observer instanceof first.frame.contentWindow.MutationObserver).toBe(true);

    const firstRoot = first.handle.element;
    firstRoot.querySelector('[data-action="attach"]').click();
    firstRoot
      .querySelector('[data-action="attach"]')
      .dispatchEvent(new first.frame.contentWindow.KeyboardEvent("keydown", { key: "Enter" }));
    firstRoot
      .querySelector('[data-action="attach"]')
      .dispatchEvent(new first.frame.contentWindow.KeyboardEvent("keydown", { key: " " }));
    expect(firstAction.calls.count()).toBe(3);
    expect(secondAction).not.toHaveBeenCalled();

    firstRoot.querySelector(".btn-minimize").click();
    firstRoot.querySelector(".btn-maximize").click();
    firstRoot.querySelector(".btn-close").click();
    firstRoot.querySelector(".app-icon").click();
    await conditionPromise(() => first.controller.calls.includes("maximize"));
    expect(first.controller.calls).toContain("minimize");
    expect(first.controller.calls).toContain("maximize");
    expect(first.controller.calls).toContain("request-close");
    expect(first.controller.calls).toContain("app-icon");
    expect(second.controller.calls).toEqual([]);

    first.controller.emitState({ maximized: true });
    expect(firstRoot.querySelector(".btn-maximize").getAttribute("aria-label")).toBe(
      "Restore window",
    );
    first.controller.emitBlur();
    expect(firstRoot.classList).toContain("is-window-blurred");
    first.controller.emitFocus();
    await Promise.resolve();
    expect(firstRoot.classList).not.toContain("is-window-blurred");

    first.handle.setTitle("Renamed");
    expect(firstRoot.querySelector(".custom-title").textContent).toBe("Renamed");
    expect(second.handle.element.querySelector(".custom-title").textContent).toBe("Second");
    lumine.config.set("title-bar.controlTheme", "GNOME");
    expect(firstRoot.classList).toContain("theme-gnome");
    expect(second.handle.element.classList).toContain("theme-gnome");

    expect(lumine.menu.update).toBe(menuUpdate);
    expect(lumine.contextMenu.showForEvent).toBe(contextMenuShow);
    expect(document.querySelectorAll(".app-menu-submenu-portal").length).toBe(portalCount);
  });

  it("centers icon-only actions and renders chrome labels as realm-local tooltips", () => {
    const surface = createSurface("Tooltip surface", () => {});
    const { contentDocument, contentWindow } = surface.frame;
    const action = surface.handle.element.querySelector('[data-action="attach"]');
    const appIcon = surface.handle.element.querySelector(".app-icon");
    const minimize = surface.handle.element.querySelector(".btn-minimize");

    const actionStyle = contentWindow.getComputedStyle(action);
    const iconStyle = contentWindow.getComputedStyle(action, "::before");
    expect(parseFloat(actionStyle.paddingLeft)).toBeGreaterThan(0);
    expect(actionStyle.paddingLeft).toBe(actionStyle.paddingRight);
    expect(iconStyle.marginRight).toBe("0px");

    for (const element of [action, appIcon, minimize]) {
      expect(element.hasAttribute("title")).toBe(false);
      expect(lumine.tooltips.findTooltips(element).length).toBe(1);
    }

    const [tooltip] = lumine.tooltips.findTooltips(action);
    tooltip.show();
    const tooltipElement = contentDocument.querySelector(".tooltip");
    expect(tooltipElement).not.toBeNull();
    expect(tooltipElement.ownerDocument).toBe(contentDocument);
    expect(tooltipElement.querySelector(".tooltip-inner").textContent).toBe(
      "Attach Tooltip surface",
    );
  });

  it("tears down handles and the factory idempotently", () => {
    const action = jasmine.createSpy("action");
    const surface = createSurface("Disposable", action);
    const actionElement = surface.handle.element.querySelector('[data-action="attach"]');

    surface.handle.destroy();
    surface.handle.destroy();
    actionElement.click();
    surface.handle.setTitle("Ignored");

    expect(action).not.toHaveBeenCalled();
    expect(lumine.tooltips.findTooltips(actionElement)).toEqual([]);
    expect(surface.handle.element.isConnected).toBe(false);
    expect(factory.instances.size).toBe(0);
    expect(() => factory.destroy()).not.toThrow();
    expect(() => factory.destroy()).not.toThrow();
  });

  it("invalidates every handle when the factory is destroyed first", () => {
    const action = jasmine.createSpy("action");
    const surface = createSurface("Factory owned", action);
    const root = surface.handle.element;
    const actionElement = root.querySelector('[data-action="attach"]');
    const titleElement = root.querySelector(".custom-title");
    const originalTitle = titleElement.textContent;

    factory.destroy();
    actionElement.click();
    surface.handle.setTitle("Ignored");
    surface.handle.destroy();
    surface.handle.destroy();

    expect(action).not.toHaveBeenCalled();
    expect(titleElement.textContent).toBe(originalTitle);
    expect(root.isConnected).toBe(false);
    expect(factory.instances.size).toBe(0);
    expect(() =>
      factory.create({ document, controller: surface.controller, title: "Too late" }),
    ).toThrowError("The surface title-bar factory has been destroyed");
  });

  it("settles a rejected state read after its realm is destroyed", async () => {
    const frame = document.createElement("iframe");
    jasmine.attachToDOM(frame);
    frames.push(frame);
    const requests = [];
    const chrome = new TitleBarChrome({
      document: frame.contentDocument,
      controller: {
        getState: () =>
          new Promise((resolve, reject) => {
            requests.push({ resolve, reject });
          }),
      },
    });
    const pending = chrome.syncWindowState();
    chrome.destroy();
    for (const request of requests) request.reject(new Error("window closed"));

    await expectAsync(pending).toBeResolved();
  });

  it("re-reads primary state instead of treating native event payloads as state", async () => {
    const listeners = [];
    for (const method of [
      "onDidMaximize",
      "onDidUnmaximize",
      "onDidEnterFullScreen",
      "onDidLeaveFullScreen",
    ]) {
      spyOn(lumine.window, method).and.callFake((callback) => {
        listeners.push(callback);
        return { dispose() {} };
      });
    }
    const state = { maximized: false, fullScreen: false };
    spyOn(lumine.window, "getState").and.callFake(() => ({ ...state }));
    const chrome = new TitleBarChrome({
      document,
      controller: createPrimaryController(),
    });
    await conditionPromise(() => lumine.window.getState.calls.count() === 1);

    state.maximized = true;
    listeners[0]({ sender: "native IPC event, not a window state" });
    await conditionPromise(() => lumine.window.getState.calls.count() === 2);

    expect(chrome.windowControls.maximize.getAttribute("aria-label")).toBe("Restore window");
    chrome.destroy();
  });
});
