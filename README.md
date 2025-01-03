# Floating Scroll

> [!WARNING]
> Floating Scroll is still under active development and not in a usable state!

Floating Scroll is a GNOME Shell extension that implements a scrollable floating window manager. It's inspired by [PaperWM](https://github.com/paperwm/PaperWM) and [HyprScroller](https://github.com/dawsers/hyprscroller).

## What is a scrollable floating window manager

You're probably familiar with [floating window management](https://en.wikipedia.org/wiki/Stacking_window_manager), as it is the default on most desktop operating systems (i. e. Windows, macOS, and even most Linux desktop environments). App windows are freely placed on the screen, giving you complete control over their layout. You can move and resize windows however you like. The learning curve is minimal. However, as windows accumulate, they can quickly clutter the desktop, making it harder to manage multiple apps effectively. You may find yourself manually rearranging and resizing windows. To mitigate this, floating window managers usually offer a tiling feature, where you can snap windows to the edges of the screen to quickly fill portions of the desktop (e.g., snapping a window to fill half or a quarter of the screen).

On the other hand, [tiling window managers](https://en.wikipedia.org/wiki/Tiling_window_manager) automatically arrange windows in a non-overlapping grid, ensuring that all open windows are visible at once and making better use of screen space. While tiling window managers do exist on Windows and macOS, they are most commonly used on Linux. The downside is that they come with a steeper learning curve. They often require manual configuration, rely heavily on keybindings, and introduce a new workflow that users need to adapt to. Additionally, they may have compatibility issues, as not all apps are resizable or look good when tiled - especially on larger screens.

A third type of window manager is the scrollable (tiling) window manager. Windows are arranged in non-overlapping, full-screen-height columns on an infinite horizontal strip. Opening new windows can push older ones off-screen. This concept is similar to the recent apps view on Android or iOS, but with a key difference: you don't need to perform any actions (like swiping up) to access this view, and you can see multiple apps at once. This type of window management is niche - even within the Linux community. [PaperWM](https://github.com/paperwm/PaperWM) has helped popularize it in recent time. There are quite a few implementations that have been inspired by it, such as [Niri](https://github.com/YaLTeR/niri), a scrollable-tiling Wayland compositor. Niri's README [lists some more](https://github.com/YaLTeR/niri?tab=readme-ov-file#tile-scrollably-elsewhere). Like traditional tiling window managers, scrollable tiling window managers automatically arrange windows, reducing the need for manual management by the user. However, they still share the same drawback: app compatibility.

Floating Scroll is a scrollable "window manager" that combines the best features of floating and tiling window managers. It uses floating windows but with advanced on-demand tiling, offering several key benefits:

- **Automatic window placement:** Windows are placed on an infinite strip, and focused windows are (optionally) automatically centered. This minimizes the need for manual window management, especially since most of the time you'll only be using one window.
- **On-demand tiling:** If you do need to use multiple windows, you can quickly tile them, making multi-tasking fast and efficient.
- **No compatibility issues:** Since all windows are floating, there's no need for exception handling. Windows appear exactly as intended.

For more details and screencasts, check out the [user manual](https://github.com/Leleat/floating-scroll/tree/main/docs/user-guide).

## Documentation

In the `docs/` directory you will find the [user manual](https://github.com/Leleat/floating-scroll/tree/main/docs/user-guide) and a [developer guide](https://github.com/Leleat/floating-scroll/tree/main/docs/developer-guide).

## Installation

The officially supported way of installing Floating Scoll is via [extensions.gnome.org](https://extensions.gnome.org/). If you want an up-to-date version, you can manually install the extension from source. To do so, clone the repository and run the `scripts/build.sh` script with the `-i` flag. If you've manually installed the extension, you need to reload GNOME Shell (e.g. by logging out) to be able to enable Floating Scroll in the Extensions app.

> [!WARNING]
> You will not get automatic updates, if you've installed Floating Scroll manually. You'll need to uninstall and then reinstall Floating Scroll via [extensions.gnome.org](https://extensions.gnome.org/) to get automatic updates back.

## Supported GNOME Versions

The [metadata file](https://github.com/Leleat/floating-scroll/blob/main/metadata.json) lists all currently supported GNOME Shell versions. Generally, only the most recent GNOME Shell is supported. That means older releases may not include all features and bug fixes. The [changelog](https://github.com/Leleat/floating-scroll/blob/main/CHANGELOG.md) will list all changes in reverse chronological order.

## License

This extension is distributed under the terms of the GNU General Public License, version 2 or later. See the license file for details.
