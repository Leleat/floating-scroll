import { Adw, type Gio, GObject, Gtk } from "./dependencies.js";

import { ShortcutKey, updateMultiStageShortcutActivators } from "../shared.js";
import { FsShortcutEditor } from "./fsShortcutEditor.js";
import { clutterToGdkMask, formatShortcut } from "./utils.js";

const NO_ACCEL_TEXT = "Disabled";

export class FsShortcutRow extends Adw.ActionRow {
    static {
        GObject.registerClass(
            {
                GTypeName: "FsShortcutRow",
                InternalChildren: ["label", "clear-button"],
                Template: "resource:///ui/components/fsShortcutRow.ui",
            },
            this,
        );
    }

    declare _label: Gtk.Label;
    declare _clear_button: Gtk.Button;

    private key!: ShortcutKey;
    private settings!: Gio.Settings;

    bind(settings: Gio.Settings, key: ShortcutKey) {
        this.settings = settings;
        this.key = key;

        this.updateUi();
        this.settings.connect(`changed::${key}`, () => this.updateUi());

        this.connect("activated", () => {
            new FsShortcutEditor({
                shortcutName: this.get_title(),
                shortcutKey: key,
                transient_for: this.get_root() as Adw.PreferencesWindow,
                destroy_with_parent: true,
            }).present();
        });
    }

    on_clear_button_clicked() {
        const wasMultiStage = this.settings.get_strv(this.key).length > 1;

        this.settings.set_strv(this.key, []);

        if (wasMultiStage) {
            updateMultiStageShortcutActivators(this.settings);
        }
    }

    private updateUi() {
        const [shortcut, ...secondaries] = this.settings.get_strv(this.key);
        const secondaryActivators = secondaries.map((c) => {
            const [keyval, mask] = c.split("+").map(Number);

            return Gtk.accelerator_get_label(keyval, clutterToGdkMask(mask));
        });

        if (shortcut) {
            const separator = secondaryActivators.length ? "  🠦  " : "";
            const label = `${formatShortcut(shortcut)}${separator}${secondaryActivators.join(
                separator,
            )}`;

            this._label.set_label(label);
            this._label.set_tooltip_text(label);
            this._label.remove_css_class("dim-label");

            this._clear_button.set_sensitive(true);
        } else {
            this._label.set_label(NO_ACCEL_TEXT);
            this._label.set_tooltip_text(NO_ACCEL_TEXT);
            this._label.add_css_class("dim-label");

            this._clear_button.set_sensitive(false);
        }
    }
}
