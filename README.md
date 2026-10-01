# title-bar

Theme-aware custom title bar with integrated menu.

## Features

- **Custom title bar**: owns the title, drag region, window controls, app icon, and control tiles on every frameless window.
- **Control themes**: offers Windows 11, macOS Tahoe, and GNOME window controls, with default resolving to the platform theme.
- **Theme-aware colors**: derives colors from the Lumine UI variables.
- **Keyboard menu**: hosts core's HTML application menu on Windows and Linux, activated by tapping Alt; macOS keeps its system Application Menu.
- **Auto-hidden menu bar**: optionally hides the Windows/Linux menu bar until revealed, allowing its area to drag the window while hidden.
- **Tile host**: lets other packages add controls near the window buttons through a service.

## Installation

To install `title-bar` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/title-bar`.

## Commands

Commands available in `lumine-workspace`:

- `title-bar:toggle`: toggle title bar visibility,
- `title-bar:focus-menu`: focus the first menu label for keyboard navigation on Windows/Linux,
- `window:toggle-menu-bar`: toggle automatic menu-bar hiding on Windows/Linux.

## Services

- [`title-bar`](docs/title-bar.md): provided to let other packages add control tiles to the title bar near the window buttons.

## Customization

Restyle the title bar by adding CSS to your `styles.css`. For example, to give it a custom background and taller height:

```css
.title-bar {
  background-color: #1f2430;
}
```

The custom properties the package reads are declared on `:root`, so override them there rather than on `.title-bar`:

```css
:root {
  --title-bar-height: 40px;
  --title-bar-control-width: 42px;
}
```

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
