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

  it("hosts independent chrome and a reattach pin in each additional window", async () => {
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
      expect(window.getElement().querySelectorAll(".attach-window").length).toBe(
        window.isMain() ? 0 : 1,
      );
    }
    const attach = spyOn(workspace, "attachWindow").and.resolveTo(workspace.getMainWindow());
    first.getElement().querySelector(".attach-window button").click();
    expect(attach).toHaveBeenCalledOnceWith(first);
    await workspace.releaseEditorWindow(second);
    expect(disposed).toHaveBeenCalledTimes(1);
    registration.dispose();
    expect(disposed).toHaveBeenCalledTimes(3);
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
