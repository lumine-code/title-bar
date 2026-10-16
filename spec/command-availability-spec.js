describe("Title menu platform availability", () => {
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("title-bar");
  });
  it("keeps HTML menu operations unavailable on macOS", () => {
    const target = lumine.workspace.getElement(),
      supported = process.platform !== "darwin";
    expect(lumine.commands.canDispatch(target, "title-bar:focus-menu")).toBe(supported);
    expect(lumine.commands.canDispatch(target, "window:toggle-menu-bar")).toBe(supported);
    expect(lumine.commands.canDispatch(target, "title-bar:toggle")).toBe(true);
  });
});
