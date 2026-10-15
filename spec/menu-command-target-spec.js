describe("Title Bar application-menu command targets", () => {
  let view, menuBar, editor, editorElement, otherSurface, commands, menu, bindings;
  let localTargets, workspaceTargets;

  beforeEach(async () => {
    await lumine.packages.activatePackage("title-bar");
    jasmine.attachToDOM(lumine.workspace.getElement());
    const { TitleBarView } = require("../lib/view");
    const { Config } = require("../lib/types");
    editor = await lumine.workspace.open();
    editorElement = editor.getElement();
    expect(editorElement.isConnected).toBe(true);
    editorElement.classList.add("title-bar-contract-editor");
    otherSurface = document.createElement("button");
    otherSurface.className = "title-bar-contract-other-surface";
    lumine.workspace.getElement().append(otherSurface);
    localTargets = [];
    workspaceTargets = [];
    const local = lumine.commands.add("lumine-text-editor.title-bar-contract-editor", {
      "title-bar:scope-test-local": (event) => localTargets.push(event.target),
    });
    const global = lumine.commands.add("lumine-workspace", {
      "title-bar:scope-test-workspace": (event) => workspaceTargets.push(event.target),
    });
    commands = {
      dispose: () => {
        local.dispose();
        global.dispose();
      },
    };
    bindings = lumine.keymaps.add("title-bar-command-target-spec", {
      "lumine-text-editor.title-bar-contract-editor": { f11: "title-bar:scope-test-local" },
    });
    menu = lumine.menu.add([
      {
        label: "Packages",
        submenu: [
          {
            label: "Title Bar Target Contract",
            submenu: [
              { label: "Editor Action", command: "title-bar:scope-test-local" },
              { label: "Workspace Action", command: "title-bar:scope-test-workspace" },
              {
                label: "Editor Alias",
                command: "title-bar:scope-test-workspace",
                scope: "lumine-text-editor:not([mini])",
              },
            ],
          },
        ],
      },
    ]);
    const config = new Config();
    config.autoHide = false;
    view = new TitleBarView(config, { platform: "win32" });
    jasmine.attachToDOM(view.element);
    menuBar = view.getMenuBar();
    menuBar.layout(10000);
  });

  afterEach(async () => {
    menuBar?.blur();
    view?.deactivate();
    menu?.dispose();
    commands?.dispose();
    bindings?.dispose();
    otherSurface?.remove();
    const pane = lumine.workspace.paneForItem(editor);
    if (pane) await pane.destroyItem(editor, true);
  });

  function contractSubmenu(list = menuBar.popup.rootList) {
    const item = list.items.find(({ template }) => template.label === "Title Bar Target Contract");
    expect(item).toBeDefined();
    return menuBar.popup.openSubmenu(item, { selectFirst: true });
  }

  it("uses the pre-menu focus for availability, shortcuts, and execution", async () => {
    for (const surface of [otherSurface, editorElement]) {
      surface.focus();
      const origin = document.activeElement;
      const packages = menuBar.buttons.find(({ template }) => template.id === "Packages");
      packages.element.dispatchEvent(
        new MouseEvent("mousedown", { button: 0, bubbles: true, cancelable: true }),
      );
      packages.element.click();
      const list = contractSubmenu();
      const [local, global, alias] = list.items;
      expect(menuBar.element.classList).toContain("title-bar-menu-bar");
      expect(local.enabled).toBe(surface === editorElement);
      expect(local.keystrokeElement.textContent).toBe(surface === editorElement ? "F11" : "");
      expect(global.enabled).toBe(true);
      expect(alias.enabled).toBe(surface === editorElement);
      if (surface === editorElement) local.activate();
      else global.activate();
      await Promise.resolve();
      expect(document.activeElement).toBe(origin);
      expect((surface === editorElement ? localTargets : workspaceTargets).at(-1)).toBe(origin);
    }
    expect(localTargets.length).toBe(1);
    expect(workspaceTargets).toEqual([otherSurface]);
  });

  it("preserves the editor target while navigating the title-bar menu with the keyboard", async () => {
    editorElement.focus();
    const origin = document.activeElement;
    menuBar.focus();
    const packages = menuBar.buttons.find(({ template }) => template.id === "Packages");
    packages.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    const contract = menuBar.popup.rootList.items.find(
      ({ template }) => template.label === "Title Bar Target Contract",
    );
    menuBar.popup.rootList.selectItem(contract, { focus: true });
    contract.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    const local = menuBar.popup.lists.at(-1).items[0];
    expect(local.enabled).toBe(true);
    expect(local.commandTarget).toBe(origin);
    local.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();
    expect(localTargets).toEqual([origin]);
    expect(document.activeElement).toBe(origin);
  });

  it("uses the same saved target through the title-bar overflow menu", async () => {
    editorElement.focus();
    const origin = document.activeElement;
    menuBar.layout(1);
    expect(menuBar.overflowTemplates.length).toBeGreaterThan(0);
    menuBar.overflowButton.element.click();
    const packages = menuBar.popup.rootList.items.find(
      ({ template }) => template.label === "Packages",
    );
    const packageList = menuBar.popup.openSubmenu(packages);
    const local = contractSubmenu(packageList).items[0];
    expect(local.enabled).toBe(true);
    expect(local.commandTarget).toBe(origin);
    local.activate();
    await Promise.resolve();
    expect(localTargets).toEqual([origin]);
  });
});
