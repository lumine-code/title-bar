describe("Title bar window contributions", () => {
  let service, leases;
  beforeEach(async () => {
    service = (await lumine.packages.activatePackage("title-bar")).mainModule.provideTitleBar();
    leases = [];
  });
  afterEach(async () => {
    for (const lease of leases) lease.dispose();
    await lumine.workspace.discardEditorWindows();
  });

  it("hosts independent chrome and reattaches additional windows through the logo", async () => {
    const workspace = lumine.workspace;
    const first = await workspace.openEditorWindow({ show: false });
    const records = [];
    const disposed = jasmine.createSpy("disposed");
    const registration = service.addItem({
      windows: "all",
      create: (context) => {
        const element = context.document.createElement("title-bar-tile");
        records.push({ ...context, element });
        return { element, dispose: disposed };
      },
    });
    leases.push(registration);
    const second = await workspace.openEditorWindow({ show: false });
    expect(records.map((entry) => entry.window)).toEqual(workspace.getWindows());
    for (const window of workspace.getWindows()) {
      expect(window.getElement().querySelectorAll(".title-bar").length).toBe(1);
      expect(window.getElement().querySelector(".attach-window")).toBeNull();
    }
    const attach = spyOn(workspace, "attachWindow").and.resolveTo(workspace.getMainWindow());
    const logo = first.getElement().querySelector(".app-icon");
    expect(logo.getAttribute("aria-label")).toBe("Attach to Main Window");
    logo.querySelector("img").click();
    expect(attach).toHaveBeenCalledOnceWith(first);
    await workspace.releaseEditorWindow(second);
    expect(disposed).toHaveBeenCalledTimes(1);
    registration.dispose();
    expect(disposed).toHaveBeenCalledTimes(3);
  });

  it("reattaches the actual pane and editor when clicking the visible logo", async () => {
    const workspace = lumine.workspace;
    jasmine.attachToDOM(workspace.getElement());
    const editor = await workspace.open("");
    editor.setText("Logo reattachment");
    const pane = workspace.paneForItem(editor);
    const extra = await workspace.detachPane(pane);
    const logo = extra.getElement().querySelector(".app-icon");
    const bounds = logo.getBoundingClientRect();
    const target = extra
      .getDocument()
      .elementFromPoint((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2);
    expect(target.closest(".app-icon")).toBe(logo);
    expect(getComputedStyle(logo).getPropertyValue("-webkit-app-region")).toBe("no-drag");
    const attach = spyOn(workspace, "attachWindow").and.callThrough();
    target.click();
    expect(attach).toHaveBeenCalledOnceWith(extra);
    await attach.calls.mostRecent().returnValue;
    expect(workspace.getWindows()).not.toContain(extra);
    expect(workspace.paneForItem(editor)).toBe(pane);
    expect(workspace.getMainWindow().getEditorContainer().getPanes()).toContain(pane);
    expect(editor.getText()).toBe("Logo reattachment");
    expect(editor.getElement().ownerDocument).toBe(workspace.getMainWindow().getDocument());
  });

  it("activates the additional window logo with Enter and Space", async () => {
    const workspace = lumine.workspace;
    const extra = await workspace.openEditorWindow({ show: false });
    const logo = extra.getElement().querySelector(".app-icon");
    const attach = spyOn(workspace, "attachWindow").and.resolveTo(workspace.getMainWindow());
    for (const key of ["Enter", " "]) {
      const event = new (extra.getDOMWindow().KeyboardEvent)("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      logo.dispatchEvent(event);
      expect(event.defaultPrevented).toBeTrue();
    }
    expect(attach).toHaveBeenCalledTimes(2);
    expect(attach.calls.allArgs()).toEqual([[extra], [extra]]);
  });

  it("keeps the main window logo's About action", () => {
    const workspace = lumine.workspace;
    const dispatch = spyOn(lumine.commands, "dispatch").and.returnValue(true);
    const attach = spyOn(workspace, "attachWindow");
    workspace.getMainWindow().getElement().querySelector(".app-icon img").click();
    expect(dispatch).toHaveBeenCalledOnceWith(
      workspace.getMainWindow().getElement(),
      "application:about",
    );
    expect(attach).not.toHaveBeenCalled();
  });

  it("keeps default contributions in main and retires the provider generation", async () => {
    const created = [];
    leases.push(
      service.addItem({
        create: ({ document, window }) => {
          created.push(window);
          return { element: document.createElement("title-bar-tile"), dispose() {} };
        },
      }),
    );
    await lumine.workspace.openEditorWindow({ show: false });
    expect(created).toEqual([lumine.workspace.getMainWindow()]);
    await lumine.packages.deactivatePackage("title-bar");
    await lumine.packages.activatePackage("title-bar");
    expect(() => service.addItem({ create: () => ({}) })).toThrowError(/disposed/);
  });
  it("uses the session launch color in every physical window", async () => {
    const dev = spyOn(lumine.window, "isDevMode").and.returnValue(false);
    const safe = spyOn(lumine.window, "isSafeMode").and.returnValue(false);
    for (const [devMode, safeMode, file] of [
      [false, false, "lumine.svg"],
      [true, false, "lumine-dev.svg"],
      [true, true, "lumine-safe.svg"],
    ]) {
      dev.and.returnValue(devMode);
      safe.and.returnValue(safeMode);
      const extra = await lumine.workspace.openEditorWindow({ show: false });
      const logo = extra.getElement().querySelector(".app-icon img");
      expect(logo.src.endsWith(`/resources/app-icons/${file}`)).toBeTrue();
      await conditionPromise(() => logo.complete);
      expect(logo.naturalWidth).toBe(128);
    }
  });
});
