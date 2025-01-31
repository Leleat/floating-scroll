import { Adw, Gdk, GObject, Gtk } from "./dependencies.js";

import {
    disableMultiStageShortcutActivators,
    updateMultiStageShortcutActivators,
} from "../shared.js";
import {
    clutterToGdkMask,
    formatShortcut,
    gdkToClutterMask,
    getSettings,
    isValidShortcut,
} from "./utils.js";

const NO_ACCEL_TEXT = "Shortcut disabled";

export class FsShortcutEditor extends Adw.Window {
    static {
        GObject.registerClass(
            {
                GTypeName: "FsShortcutEditor",
                InternalChildren: [
                    "apply-button",
                    "preview-new-shortcut-label",
                ],
                Template: "resource:///ui/components/fsShortcutEditor.ui",
            },
            this,
        );
    }

    declare _apply_button: Gtk.Button;
    declare _preview_new_shortcut_label: Gtk.Label;

    private currShortcutKey: string;
    private prevActivators: string[];
    private currPrimaryActivator: string = "";
    private currSecondaryActivators: {
        keyval: number;
        mask: Gdk.ModifierType;
    }[] = [];

    constructor({
        shortcutName,
        shortcutKey,
        transient_for,
        destroy_with_parent,
    }: {
        shortcutName: string;
        shortcutKey: string;
        transient_for: Adw.PreferencesWindow;
        destroy_with_parent: true;
    }) {
        super({
            title: shortcutName,
            transient_for,
            destroy_with_parent,
        });

        const settings = getSettings();

        this.currShortcutKey = shortcutKey;
        this.prevActivators = settings.get_strv(shortcutKey);

        const [primaryActivator, ...secondaryActivators] = this.prevActivators;

        this.setPreviewLabel({
            primaryActivator,
            secondaryActivators: secondaryActivators.map((s) => {
                const [keyval, mask] = s.split("+").map(Number);

                return { keyval, mask: clutterToGdkMask(mask) };
            }),
        });

        this.connect("map", () =>
            disableMultiStageShortcutActivators(settings),
        );
        this.connect("unmap", () =>
            updateMultiStageShortcutActivators(settings),
        );
    }

    on_apply_button_clicked() {
        const settings = getSettings();

        settings.set_strv(
            this.currShortcutKey,
            this.currPrimaryActivator ?
                [
                    this.currPrimaryActivator,
                    ...this.currSecondaryActivators.map(
                        (s) => `${s.keyval}+${gdkToClutterMask(s.mask)}`,
                    ),
                ]
            :   [],
        );

        this.close();
    }

    on_event_controller_key_pressed(
        eventController: Gtk.EventController,
        keyval: number,
        keycode: number,
        state: Gdk.ModifierType,
    ) {
        const mask =
            state &
            Gtk.accelerator_get_default_mod_mask() &
            ~Gdk.ModifierType.LOCK_MASK;

        if (mask === 0) {
            switch (keyval) {
                case Gdk.KEY_Escape:
                    this.close();

                    return Gdk.EVENT_STOP;
                case Gdk.KEY_BackSpace:
                    this._apply_button.set_sensitive(true);
                    this.updateShortcuts({
                        primaryActivator: "",
                        secondaryActivators: [],
                    });

                    return Gdk.EVENT_STOP;
                case Gdk.KEY_KP_Enter:
                case Gdk.KEY_Return:
                case Gdk.KEY_space:
                    this.on_apply_button_clicked();

                    return Gdk.EVENT_STOP;
            }
        }

        if (this.currPrimaryActivator) {
            if (!Gtk.accelerator_valid(keyval, mask)) {
                return Gdk.EVENT_STOP;
            }

            this._apply_button.set_sensitive(true);

            this.updateShortcuts({
                primaryActivator: this.currPrimaryActivator,
                secondaryActivators: this.currSecondaryActivators.concat({
                    keyval,
                    mask,
                }),
            });
        } else {
            if (!isValidShortcut({ keycode, keyval, mask })) {
                return Gdk.EVENT_STOP;
            }

            this._apply_button.set_sensitive(true);

            this.updateShortcuts({
                primaryActivator: Gtk.accelerator_name_with_keycode(
                    null,
                    keyval,
                    keycode,
                    mask,
                ),
                secondaryActivators: [],
            });
        }

        return Gdk.EVENT_STOP;
    }

    private setPreviewLabel({
        primaryActivator,
        secondaryActivators,
    }: {
        primaryActivator: string;
        secondaryActivators: { keyval: number; mask: Gdk.ModifierType }[];
    }) {
        if (primaryActivator) {
            const secondaryActivatorLabels = secondaryActivators.map((c) =>
                Gtk.accelerator_get_label(c.keyval, c.mask),
            );
            const separator = secondaryActivatorLabels.length ? "        " : "";
            const shortcutLabel = `${formatShortcut(
                primaryActivator,
            )}${separator}${secondaryActivatorLabels.join(separator)}`;

            this._preview_new_shortcut_label.set_tooltip_text(shortcutLabel);
            this._preview_new_shortcut_label.set_label(
                `<b>${shortcutLabel}</b>`,
            );
        } else {
            this._preview_new_shortcut_label.set_tooltip_text(NO_ACCEL_TEXT);
            this._preview_new_shortcut_label.set_label(
                `<i>${NO_ACCEL_TEXT}</i>`,
            );
        }
    }

    private updateShortcuts({
        primaryActivator,
        secondaryActivators,
    }: {
        primaryActivator: string;
        secondaryActivators: { keyval: number; mask: Gdk.ModifierType }[];
    }) {
        this.setPreviewLabel({ primaryActivator, secondaryActivators });

        this.currPrimaryActivator = primaryActivator;
        this.currSecondaryActivators = secondaryActivators;
    }
}
