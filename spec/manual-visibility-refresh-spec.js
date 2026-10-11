beforeEach(() => {
  for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
    if (!jasmine.isSpy(lumine.shell[method])) spyOn(lumine.shell, method).and.resolveTo();
  if (!jasmine.isSpy(lumine.application.openWindow))
    spyOn(lumine.application, "openWindow").and.resolveTo();
});

describe("Title Bar manual visibility during window refresh", () => {
  let view;
  beforeEach(async () => {
    jasmine.useRealClock();
    if (lumine.packages.isPackageLoaded("title-bar"))
      await lumine.packages.unloadPackage("title-bar");
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("title-bar");
    // This generation exposes its own chrome in dev mode. The refresh asks
    // the actual primary Core WindowService for state; no getter is replaced.
    view = window.titleBar.titleBarView;
    await view.chrome.syncWindowState();
    expect(view.chrome.windowState.fullscreen).toBe(false);
  });
  afterEach(async () => {
    if (lumine.packages.isPackageLoaded("title-bar"))
      await lumine.packages.unloadPackage("title-bar");
    view = null;
  });
  it("keeps the publicly hidden title bar hidden after reading the current window state", async () => {
    await lumine.commands.dispatch(lumine.workspace.getElement(), "title-bar:toggle");
    expect(view.element.classList.contains("no-title-bar")).toBe(true);
    expect(getComputedStyle(view.element).display).toBe("none");
    await view.chrome.syncWindowState();
    expect(view.element.classList.contains("no-title-bar")).toBe(true);
    expect(getComputedStyle(view.element).display).toBe("none");
  });
  it("keeps the ordinary shown bar after toggling it back and refreshing current state", async () => {
    const workspace = lumine.workspace.getElement();
    await lumine.commands.dispatch(workspace, "title-bar:toggle");
    await lumine.commands.dispatch(workspace, "title-bar:toggle");
    await view.chrome.syncWindowState();
    expect(view.element.classList.contains("no-title-bar")).toBe(false);
    expect(getComputedStyle(view.element).display).not.toBe("none");
  });
});
