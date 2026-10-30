const { ipcRenderer } = require("electron");

async function pointer(type, element) {
  const rect = element.getBoundingClientRect();
  await ipcRenderer.invoke("lumine:window", "sendInputEvent", {
    type,
    x: Math.floor(rect.left + rect.width / 2),
    y: Math.floor(rect.top + rect.height / 2),
    button: "left",
    clickCount: 1,
  });
}

describe("Title bar window controls above modal backdrops", () => {
  for (const controlTheme of ["Default", "Windows 11", "macOS Tahoe", "GNOME"]) {
    it(`keeps ${controlTheme} controls clickable and highlighted without dismissing the modal`, async () => {
      jasmine.useRealClock();
      const workspace = lumine.workspace.getElement();
      jasmine.attachToDOM(workspace);
      const previousStyle = workspace.getAttribute("style");
      // Exercise the real workspace above the test reporter, preserving the
      // relative layers of the title bar and its modal panel.
      workspace.style.cssText =
        "position:fixed;inset:0;z-index:100000;--title-bar-transition-normal:0s;--title-bar-transition-slow:0s";
      await lumine.packages.activatePackage("one-theme");
      await lumine.packages.activatePackage("one-day-ui");
      await lumine.packages.activatePackage("title-bar");
      const view = window.titleBar.titleBarView;
      const chrome = view.chrome;
      const previousTheme = lumine.config.get("title-bar.controlTheme");
      lumine.config.set("title-bar.controlTheme", controlTheme);
      const minimize = spyOn(chrome.controller, "minimize");
      const maximize = spyOn(chrome, "toggleMaximized");
      const close = spyOn(chrome.controller, "requestClose");
      const host = lumine.workspace.addSelectList({
        items: [{ id: "choice", name: "Choice" }],
        getItemId: (item) => item.id,
        search: { getFilterText: (item) => item.name },
        renderItem: (item) => ({ primary: item.name }),
      });

      try {
        await host.show();
        const panel = host.getPanel().getElement();
        const lostFocus = jasmine.createSpy("modal lost focus");
        panel.addEventListener("focusout", lostFocus);
        expect(getComputedStyle(panel, "::after").backdropFilter).toContain("blur(");
        for (const button of Object.values(chrome.windowControls)) {
          const rect = button.getBoundingClientRect();
          for (const y of [Math.ceil(rect.top), Math.floor(rect.top + rect.height / 2)]) {
            const target = document.elementFromPoint(Math.floor(rect.left + rect.width / 2), y);
            expect(target?.closest("[data-window-control]")).toBe(button);
          }
          await pointer("mouseMove", button);
          await new Promise((resolve) => setTimeout(resolve, 180));
          expect(button.matches(":hover")).toBe(true);
          const color =
            chrome.element.classList.contains("theme-macos-tahoe")
              ? getComputedStyle(button, "::before").backgroundColor
              : getComputedStyle(button).backgroundColor;
          expect(color).not.toBe("rgba(0, 0, 0, 0)");
          await pointer("mouseDown", button);
          await pointer("mouseUp", button);
          await new Promise((resolve) => requestAnimationFrame(resolve));
          expect(host.isVisible()).toBe(true);
          expect(panel.contains(document.activeElement)).toBe(true);
        }
        expect(minimize).toHaveBeenCalledTimes(1);
        expect(maximize).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
        expect(lostFocus).not.toHaveBeenCalled();

        // Ordinary title-bar actions remain behind the modal backdrop.
        const icon = chrome.appIcon.getBoundingClientRect();
        const target = document.elementFromPoint(
          Math.floor(icon.left + icon.width / 2),
          Math.floor(icon.top + icon.height / 2),
        );
        expect(target).toBe(panel);
      } finally {
        await host.destroy();
        lumine.config.set("title-bar.controlTheme", previousTheme);
        await lumine.packages.deactivatePackage("one-day-ui");
        await lumine.packages.deactivatePackage("one-theme");
        if (previousStyle === null) workspace.removeAttribute("style");
        else workspace.setAttribute("style", previousStyle);
      }
    });
  }
});
