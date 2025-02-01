import {
    type Adw,
    ExtensionPreferences,
    Gio,
    Gtk,
} from "./prefs/dependencies.js";

import { type FsShortcutRow } from "./prefs/fsShortcutRow.js";
import { ShortcutKey, updateMultiStageShortcutActivators } from "./shared.js";

export default class Prefs extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        this.loadResources(window);

        // Register our custom widgets
        await Promise.all([
            import("./prefs/fsShortcutEditor.js"),
            import("./prefs/fsShortcutRow.js"),
        ]);

        const builder = new Gtk.Builder();

        builder.add_from_resource("/ui/pages/placement.ui");
        builder.add_from_resource("/ui/pages/focus.ui");
        builder.add_from_resource("/ui/pages/shortcuts.ui");

        window.add(builder.get_object("placement"));
        window.add(builder.get_object("focus"));
        window.add(builder.get_object("shortcuts"));

        const settings = this.getSettings();

        bindComboRows(settings, builder);
        bindShortcuts(settings, builder);

        // We disable multi-stage shortcut activators when opening the shortcut
        // editor so that the key combos for the multi-stage shortcut activator
        // can be reused. We restore the activator if the shortcut editor closes.
        // This doesn't work if the editor crashes. So ensure the activators on
        // the next start.
        //
        // TODO We probably want to notify the user in case there was an
        // TODO inconsistency via toast.
        updateMultiStageShortcutActivators(settings);
    }

    /**
     * @param window
     */
    private loadResources(window: Adw.PreferencesWindow) {
        const resources = Gio.Resource.load(
            import.meta.url.replace(
                /file:\/\/(.*)\/prefs.js$/,
                `$1/${this.metadata.uuid}.gresource`,
            ),
        );

        Gio.resources_register(resources);

        window.connect("close-request", () => {
            Gio.resources_unregister(resources);
        });
    }
}

/**
 * @param settings
 * @param builder
 */
function bindShortcuts(settings: Gio.Settings, builder: Gtk.Builder) {
    const shortcuts: ShortcutKey[] = [
        "move-focus-left",
        "move-focus-right",
        "move-focus-up",
        "move-focus-down",
        "move-column-up",
        "move-column-down",
        "move-column-left",
        "move-column-right",
        "move-item-left",
        "move-item-right",
        "move-item-up",
        "move-item-down",
    ];

    shortcuts.forEach((key) => {
        const widget: FsShortcutRow = builder.get_object(key);

        widget.bind(settings, key);
    });
}

/**
 * @param settings
 * @param builder
 */
function bindComboRows(settings: Gio.Settings, builder: Gtk.Builder) {
    const comboRows = [
        "focus-behavior-main-axis",
        // "focus-behavior-cross-axis",
        "window-opening-position",
    ];

    comboRows.forEach((key) => {
        const widget: Adw.ComboRow = builder.get_object(key);

        widget.connect("notify::selected", () => {
            settings.set_enum(key, widget.get_selected());
        });
        widget.set_selected(settings.get_enum(key));
    });
}
