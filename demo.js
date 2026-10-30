// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: ["language-javascript", "tree-view"],
  viewport: { width: 1200, height: 760 },
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
  ],
  async cleanup({ state }) {
    state.filePickerConfirmation?.dispose();
    await state.filePicker?.destroy();
  },
};
