import { ExtensionPreferences, Gio, Gtk } from "./prefs/dependencies.js";

import { updateMultiStageShortcutActivators } from "./shared.js";

export default class Prefs extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        this._loadResources(window);

        // Register our custom widgets
        await Promise.all([
            import("./prefs/fsShortcutEditor.js"),
            import("./prefs/fsShortcutRow.js"),
        ]);

        const builder = new Gtk.Builder();

        builder.add_from_resource("/ui/pages/windowPlacement.ui");
        builder.add_from_resource("/ui/pages/windowFocus.ui");
        builder.add_from_resource("/ui/pages/shortcuts.ui");

        window.add(builder.get_object("window_placement"));
        window.add(builder.get_object("window_focus"));
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
     * @param {Adw.PreferencesWindow} window
     */
    _loadResources(window) {
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
 * @param {Gio.Settings} settings
 * @param {Gtk.Builder} builder
 */
function bindShortcuts(settings, builder) {
    [
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
    ].forEach((key) => {
        /** @type {import("./prefs/fsShortcutRow.js").FsShortcutRow} */
        const widget = getWidget(builder, key);

        widget.bind(settings, key);
    });
}

/**
 * @param {Gio.Settings} settings
 * @param {Gtk.Builder} builder
 */
function bindComboRows(settings, builder) {
    const comboRows = [
        "focus-behavior-main-axis",
        // "focus-behavior-cross-axis",
        "window-opening-position",
    ];

    comboRows.forEach((key) => {
        const widget = builder.get_object(key.replaceAll("-", "_"));

        widget.connect("notify::selected", () => {
            settings.set_enum(key, widget.get_selected());
        });
        widget.set_selected(settings.get_enum(key));
    });
}

/**
 * @param {Gtk.Builder} builder
 * @param {string} key
 *
 * @returns {Gtk.Widget}
 */
function getWidget(builder, key) {
    return builder.get_object(key.replaceAll("-", "_"));
}
