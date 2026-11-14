// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: ["language-javascript", "tree-view", "quick-layout"],
  viewport: { width: 820, height: 760 },
  async before({ lumine }) {
    lumine.config.set("title-bar.autoHide", false);
  },
  async prepare(context) {
    const { lumine, state, fixture, open } = context;
    state.editor = await open("Signal Lab/src/signal.js");
    await lumine.project.setPaths([fixture("Signal Lab")]);
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Use the editor title bar and application menu with an open project.",
      timeout: 60000,
      async run(context) {
        const { lumine, state } = context;
        {
          lumine.commands.dispatch(lumine.views.getView(state.editor), "tree-view:show");
        }
      },
      ready() {
        return Boolean(document.querySelector(".title-bar"));
      },
    },
    {
      id: "modal-window-controls",
      file: "demo-modal.png",
      caption: "Keep window controls available above a modal dialog and its blurred backdrop.",
      async run({ lumine, state, open }) {
        state.filePicker = lumine.workspace.addSelectList({
          placeholderText: "Open a Signal Lab file",
          items: ["src/signal.js", "data/samples.csv", "docs/experiments.md", "README.md"],
          renderItem: (item) => ({ primary: item }),
        });
        state.filePickerConfirmation = state.filePicker
          .getModel()
          .onDidConfirmSelection(async ({ item }) => {
            await open(`Signal Lab/${item}`);
            state.filePicker.hide();
          });
        await state.filePicker.show();
      },
      ready({ state }) {
        const close = document.querySelector(".title-bar .btn-close");
        if (!state.filePicker?.isVisible() || !close) return false;
        const bounds = close.getBoundingClientRect();
        return (
          state.filePicker.getModel().getElement().querySelectorAll("li").length === 4 &&
          document
            .elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
            ?.closest(".btn-close") === close
        );
      },
    },
    {
      id: "expanded-controls",
      file: "demo-controls-expanded.png",
      caption: "Expand the original layout controls over the title without leaving the title bar.",
      async run({ state, waitFor }) {
        state.filePicker.hide();
        await waitFor(
          () => document.querySelector(".title-bar.controls-collapsed .control-tiles-toggle"),
          "the layout controls collapse beside the title",
        );
        document.querySelector(".title-bar .control-tiles-toggle").click();
      },
      afterPointerMove({ lumine, state }) {
        lumine.views.getView(state.editor).focus();
        for (const tooltips of lumine.tooltips.tooltips.values())
          for (const tooltip of tooltips) tooltip.cancel();
      },
      ready() {
        const bar = document.querySelector(".title-bar.controls-expanded");
        if (!bar) return false;
        const viewport = bar.querySelector(".control-tiles-viewport");
        const title = bar.querySelector(".custom-title");
        const tile = bar.querySelector(".quick-layout");
        return (
          viewport.clientWidth > 0 &&
          Number(getComputedStyle(title).opacity) === 0 &&
          Number(getComputedStyle(tile).opacity) === 1
        );
      },
    },
  ],
  async cleanup({ state }) {
    state.filePickerConfirmation?.dispose();
    await state.filePicker?.destroy();
  },
};
