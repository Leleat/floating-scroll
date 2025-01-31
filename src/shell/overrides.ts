import { Gio, GLib } from "./dependencies.js";

import { Settings } from "./utils/settings.js";

let MODULE: OverridesModule = null!;

function enable() {
    MODULE = new OverridesModule();
}

function disable() {
    MODULE.destroy();
    MODULE = null!;
}

class OverridesModule {
    constructor() {
        const mutterSettings = new Gio.Settings({
            schema_id: "org.gnome.mutter",
        });

        Settings.override(
            mutterSettings,
            "edge-tiling",
            new GLib.Variant("b", false),
        );

        Settings.override(
            mutterSettings,
            "dynamic-workspaces",
            new GLib.Variant("b", false),
        );

        const wmPrefsSettings = new Gio.Settings({
            schema_id: "org.gnome.desktop.wm.preferences",
        });

        Settings.override(
            wmPrefsSettings,
            "num-workspaces",
            new GLib.Variant("i", 1),
        );

        const wmKeybindingsSettings = new Gio.Settings({
            schema_id: "org.gnome.desktop.wm.keybindings",
        });

        Settings.override(
            wmKeybindingsSettings,
            "switch-to-workspace-left",
            new GLib.Variant("as", []),
        );

        Settings.override(
            wmKeybindingsSettings,
            "switch-to-workspace-right",
            new GLib.Variant("as", []),
        );

        if (
            wmKeybindingsSettings
                .get_strv("move-to-monitor-left")
                .includes("<Super><Shift>Left")
        ) {
            Settings.override(
                wmKeybindingsSettings,
                "move-to-monitor-left",
                new GLib.Variant("as", []),
            );
        }

        if (
            wmKeybindingsSettings
                .get_strv("move-to-monitor-right")
                .includes("<Super><Shift>Right")
        ) {
            Settings.override(
                wmKeybindingsSettings,
                "move-to-monitor-right",
                new GLib.Variant("as", []),
            );
        }

        if (
            wmKeybindingsSettings
                .get_strv("move-to-monitor-up")
                .includes("<Super><Shift>Up")
        ) {
            Settings.override(
                wmKeybindingsSettings,
                "move-to-monitor-up",
                new GLib.Variant("as", []),
            );
        }

        if (
            wmKeybindingsSettings
                .get_strv("move-to-monitor-down")
                .includes("<Super><Shift>Down")
        ) {
            Settings.override(
                wmKeybindingsSettings,
                "move-to-monitor-down",
                new GLib.Variant("as", []),
            );
        }

        if (wmKeybindingsSettings.get_strv("maximize").includes("<Super>Up")) {
            Settings.override(
                wmKeybindingsSettings,
                "maximize",
                new GLib.Variant("as", []),
            );
        }

        if (
            wmKeybindingsSettings.get_strv("unmaximize").includes("<Super>Down")
        ) {
            Settings.override(
                wmKeybindingsSettings,
                "unmaximize",
                new GLib.Variant("as", []),
            );
        }

        const mutterKeybindingsSettings = new Gio.Settings({
            schema_id: "org.gnome.mutter.keybindings",
        });

        if (
            mutterKeybindingsSettings
                .get_strv("toggle-tiled-left")
                .includes("<Super>Left")
        ) {
            Settings.override(
                mutterKeybindingsSettings,
                "toggle-tiled-left",
                new GLib.Variant("as", []),
            );
        }

        if (
            mutterKeybindingsSettings
                .get_strv("toggle-tiled-right")
                .includes("<Super>Right")
        ) {
            Settings.override(
                mutterKeybindingsSettings,
                "toggle-tiled-right",
                new GLib.Variant("as", []),
            );
        }
    }

    destroy() {}
}

export { disable, enable };
