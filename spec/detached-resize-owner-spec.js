describe("Detached title bar measurement", () => {
  let view;

  afterEach(async () => {
    view?.deactivate();
    await lumine.workspace.discardEditorWindows();
  });

  it("constructs its size observer in the title bar's presentation window", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    const { TitleBarView } = require("../lib/view");
    const { Config } = require("../lib/types");
    view = new TitleBarView(new Config(), { platform: "win32", editorWindow: extra });
    expect(view.resizeObserver instanceof extra.getDOMWindow().ResizeObserver).toBeTrue();
  });
});
